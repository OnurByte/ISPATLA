import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, createHmac } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { APIError, betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { sendAuthEmail } from "./auth-mail";
import { AbuseRiskService } from "./abuse-risk";
import { normalizeEmailAddress, validateEmailQuality, type EmailQualityResult } from "./email-validation";
import { assertXAccountOwner, connectXAccount, initializeXOAuthStore } from "./x-oauth-store";
import { cacheSelectedProfileAvatar, deleteProfileAvatar } from "./profile-avatar";

type XLoginGrant = { xUserId: string; handle: string; displayName: string; bio: string; avatarSource: string | null; accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
const xLoginGrantContext = new AsyncLocalStorage<{ grant: XLoginGrant | null; ownerUserId?: string }>();
const X_PUBLISHING_SCOPES = ["tweet.read", "tweet.write", "users.read", "users.email", "media.write", "offline.access"] as const;

type SqliteResult = { changes?: number };
type SqliteStatement = { run(...params: unknown[]): SqliteResult; get?(...params: unknown[]): unknown; all?(...params: unknown[]): unknown[] };
type SqliteHandle = {
  exec(sql: string): void;
  close(): void;
  prepare?(sql: string): SqliteStatement;
  query?(sql: string): SqliteStatement;
};
type SqliteConstructor = new (path: string) => SqliteHandle;
type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

type AuthRuntime = {
  auth: AuthInstance;
  handler(request: Request): Promise<Response>;
  isUserDisabled(userId: string): boolean;
  disableUser(userId: string, now: number): void;
  close(): void;
};

function databasePath(env: Record<string, string | undefined>): string {
  return env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
}

function openDatabase(path: string): SqliteHandle {
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  if (!getBuiltinModule) throw new Error("Better Auth requires Node.js 22.5+ or Bun SQLite support");
  const runtime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
    ? getBuiltinModule("bun:sqlite") as { Database: SqliteConstructor }
    : getBuiltinModule("node:sqlite") as { DatabaseSync: SqliteConstructor };
  const Constructor = "Database" in runtime ? runtime.Database : runtime.DatabaseSync;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Constructor(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  return db;
}

function runSql(db: SqliteHandle, sql: string, ...params: unknown[]): SqliteResult {
  const statement = db.prepare?.(sql) || db.query?.(sql);
  if (!statement) throw new Error("SQLite prepared statements are unavailable");
  return statement.run(...params);
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function registerEmailVerificationToken(db: SqliteHandle, userId: string, token: string): void {
  const now = Date.now();
  runSql(db, "DELETE FROM auth_email_verification_tokens WHERE expires_at <= ?", now);
  runSql(db, "INSERT OR REPLACE INTO auth_email_verification_tokens(token_hash, user_id, expires_at) VALUES (?, ?, ?)", tokenDigest(token), userId, now + 60 * 60 * 1000);
}

function consumeEmailVerificationToken(db: SqliteHandle, token: string): boolean {
  const result = runSql(db, "DELETE FROM auth_email_verification_tokens WHERE token_hash = ? AND expires_at > ?", tokenDigest(token), Date.now());
  return result.changes === 1;
}

function twitterSignInProvider(env: Record<string, string | undefined>): BetterAuthOptions["socialProviders"] {
  const clientId = env.X_OAUTH_CLIENT_ID;
  const clientSecret = env.X_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return { twitter: {
    clientId,
    clientSecret,
    disableDefaultScope: true,
    scope: [...X_PUBLISHING_SCOPES],
    getUserInfo: async (tokens) => {
      try {
        const accessToken = tokens.accessToken;
        if (!accessToken) return null;
        const response = await fetch("https://api.x.com/2/users/me?user.fields=confirmed_email,description,profile_image_url", {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const profile = await response.json() as { data?: { id?: unknown; name?: unknown; username?: unknown; confirmed_email?: unknown; description?: unknown; profile_image_url?: unknown } };
        const user = profile.data;
        if (typeof user?.id !== "string" || typeof user.name !== "string" || typeof user.username !== "string" || typeof user.confirmed_email !== "string" || !user.confirmed_email.includes("@")) return null;
        const scopes = tokens.scopes || [];
        const context = xLoginGrantContext.getStore();
        if (!context || !tokens.refreshToken || !tokens.accessTokenExpiresAt || !Number.isFinite(tokens.accessTokenExpiresAt.getTime())
          || Math.floor(tokens.accessTokenExpiresAt.getTime() / 1000) <= Math.floor(Date.now() / 1000)
          || X_PUBLISHING_SCOPES.some((scope) => !scopes.includes(scope))) return null;
        context.grant = {
          xUserId: user.id,
          handle: user.username,
          displayName: user.name,
          bio: typeof user.description === "string" ? user.description : "",
          avatarSource: typeof user.profile_image_url === "string" ? user.profile_image_url : null,
          accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Math.floor(tokens.accessTokenExpiresAt.getTime() / 1000),
          scopes,
        };
        return {
          user: { name: user.name, email: user.confirmed_email, emailVerified: true },
          data: { data: { id: user.id, name: user.name, username: user.username, email: user.confirmed_email } },
        };
      } catch {
        return null;
      }
    },
  } };
}

function stripTwitterTokens(account: Record<string, unknown>): Record<string, unknown> {
  if (account.providerId !== "twitter" && !xLoginGrantContext.getStore()?.grant) return account;
  return { ...account, accessToken: null, refreshToken: null, idToken: null, scope: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null };
}

function authOptions(db: SqliteHandle, env: Record<string, string | undefined>, appDatabasePath = databasePath(env)): BetterAuthOptions {
  const production = env.NODE_ENV === "production";
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");

  const configuredUrl = env.BETTER_AUTH_URL || (production ? "" : "http://localhost:3000");
  let baseURL: URL;
  try {
    baseURL = new URL(configuredUrl);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute URL");
  }
  if (production && baseURL.protocol !== "https:") throw new Error("BETTER_AUTH_URL must use HTTPS in production");
  if (baseURL.username || baseURL.password || baseURL.pathname !== "/" || baseURL.search || baseURL.hash) {
    throw new Error("BETTER_AUTH_URL must be a plain origin");
  }

  db.exec(`CREATE TABLE IF NOT EXISTS auth_email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS auth_email_verification_tokens_expiry_idx ON auth_email_verification_tokens(expires_at);
  CREATE TABLE IF NOT EXISTS auth_signup_admission (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_started_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS auth_signup_admission_expiry_idx ON auth_signup_admission(window_started_at);
  CREATE TABLE IF NOT EXISTS auth_user_status (
    owner_user_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('active','disabled')), updated_at INTEGER NOT NULL
  );`);

  const trustedOrigins = new Set([baseURL.origin]);
  if (!production) {
    trustedOrigins.add("http://localhost:3000");
    trustedOrigins.add("http://127.0.0.1:3000");
  }
  for (const origin of (env.ISPATLA_AUTH_TRUSTED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("ISPATLA_AUTH_TRUSTED_ORIGINS contains an invalid origin");
    }
    if (parsed.origin !== origin || parsed.username || parsed.password || (production && parsed.protocol !== "https:")) {
      throw new Error("ISPATLA_AUTH_TRUSTED_ORIGINS must contain exact origins");
    }
    trustedOrigins.add(origin);
  }

  const twitterProvider = twitterSignInProvider(env);

  return {
    appName: "İSPATLA",
    baseURL: baseURL.origin,
    secret,
    trustedOrigins: [...trustedOrigins],
    database: db as NonNullable<BetterAuthOptions["database"]>,
    socialProviders: twitterProvider || {},
    account: {
      updateAccountOnSignIn: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAuthEmail("password-reset", { email: user.email, url }, env),
    },
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url, token }) => {
        registerEmailVerificationToken(db, user.id, token);
        await sendAuthEmail("verification", { email: user.email, url }, env);
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const [{ ensureDatabase, getAccounts }, { runAsOwner }, { revokeXAccount }, { disconnectChatGPT }] = await Promise.all([
            import("./db"), import("./owner-context"), import("./x-oauth"), import("./chatgpt-connection"),
          ]);
          if (!ensureDatabase(appDatabasePath)) throw new Error("account data store is unavailable");
          try { await runAsOwner(user.id, () => disconnectChatGPT()); } catch { /* Local owner-data purge remains authoritative if remote revocation is unavailable. */ }
          const accounts = runAsOwner(user.id, () => getAccounts());
          for (const account of accounts) {
            try { await revokeXAccount({ accountId: account.id, ownerUserId: user.id }); }
            catch { /* Local account deletion remains authoritative when provider revocation fails. */ }
          }
        },
        afterDelete: async (user) => {
          const { deleteOwnerData, ensureDatabase } = await import("./db");
          if (!ensureDatabase(appDatabasePath)) throw new Error("account data store is unavailable");
          const identities = db.prepare?.("SELECT x_user_id FROM user_profile_x_identity WHERE owner_user_id=?")?.all?.(user.id) as Array<{ x_user_id: string }> | undefined;
          deleteOwnerData(user.id);
          for (const { x_user_id: xUserId } of identities || []) {
            const stillOwned = db.prepare?.("SELECT 1 FROM user_profile_x_identity WHERE x_user_id=? LIMIT 1")?.get?.(xUserId);
            if (!stillOwned) await deleteProfileAvatar(xUserId, appDatabasePath);
          }
          runSql(db, "DELETE FROM auth_user_status WHERE owner_user_id=?", user.id);
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 20 },
        "/link-social": { window: 60, max: 20 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 5 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (account) => {
            const grant = xLoginGrantContext.getStore()?.grant;
            if (account.providerId === "twitter" && grant && account.accountId !== undefined && grant.xUserId !== account.accountId) throw new Error("X login grant did not match the authenticated account");
            if (account.providerId === "twitter" && typeof account.accountId === "string" && typeof account.userId === "string") assertXAccountOwner({ xUserId: account.accountId, ownerUserId: account.userId, databasePath: appDatabasePath });
            return { data: stripTwitterTokens(account) };
          },
          after: async (account) => provisionXLoginAccount(account, env, appDatabasePath),
        },
        update: {
          before: async (account) => {
            const grant = xLoginGrantContext.getStore()?.grant;
            if (account.providerId === "twitter" && grant && account.accountId !== undefined && grant.xUserId !== account.accountId) throw new Error("X login grant did not match the authenticated account");
            return { data: stripTwitterTokens(account) };
          },
          after: async (account) => provisionXLoginAccount(account, env, appDatabasePath),
        },
      },
      user: {
        create: {
          before: async (user) => ({ data: { ...user, name: user.email.split("@")[0] } }),
        },
      },
    },
  };
}

async function provisionXLoginAccount(account: unknown, env: Record<string, string | undefined>, appDatabasePath: string): Promise<void> {
  if (!account || typeof account !== "object") return;
  const row = account as Record<string, unknown>;
  const grant = xLoginGrantContext.getStore()?.grant;
  if (row.providerId !== "twitter") return;
  if (typeof row.userId !== "string" || !grant || row.accountId !== grant.xUserId) {
    throw new APIError("INTERNAL_SERVER_ERROR", { code: "x_account_provision_failed", message: "X account connection could not be completed" });
  }
  xLoginGrantContext.getStore()!.ownerUserId = row.userId;
  const { avatarSource, ...profileGrant } = grant;
  try { connectXAccount({ ...profileGrant, ownerUserId: row.userId, avatarUrl: null, databasePath: appDatabasePath, encryptionEnv: env }); }
  catch { throw new APIError("INTERNAL_SERVER_ERROR", { code: "x_account_provision_failed", message: "X account connection could not be completed" }); }
  if (avatarSource) {
    try { await cacheSelectedProfileAvatar({ ...profileGrant, ownerUserId: row.userId, avatarUrl: avatarSource, databasePath: appDatabasePath }); }
    catch { /* The image is optional after the account grant has been stored. */ }
  }
}

async function migrate(options: BetterAuthOptions): Promise<void> {
  const migrations = await getMigrations(options);
  if (migrations.unsafeChanges.length || migrations.schemaProblems.length) {
    throw new Error(`Better Auth schema check failed: ${[...migrations.unsafeChanges, ...migrations.schemaProblems].join("; ")}`);
  }
  await migrations.runMigrations();
}

// Without a verified peer address, the shared route ceiling bounds preflight work across all clients.
function admitSignupRequest(db: SqliteHandle, key: string, max: number, now = Math.floor(Date.now() / 1000)): boolean {
  const sql = `INSERT INTO auth_signup_admission(key,count,window_started_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN window_started_at<=? THEN 1 ELSE count+1 END,
      window_started_at=CASE WHEN window_started_at<=? THEN excluded.window_started_at ELSE window_started_at END
    WHERE window_started_at<=? OR count<? RETURNING count;`;
  const statement = db.prepare?.(sql) || db.query?.(sql);
  if (!statement?.get) throw new Error("Signup admission storage is unavailable");
  return !!statement.get(key,now,now-60,now-60,now-60,max);
}
function signupAdmissionDenied(): Response {
  return Response.json({ message: "Çok fazla kayıt isteği. Bir dakika sonra yeniden dene." }, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
}

async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 16 * 1024;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw Response.json({ message: "İstek boyutu çok büyük." }, { status: 413 });
  const reader = request.clone().body?.getReader();
  if (!reader) throw Response.json({ message: "Geçerli bir JSON nesnesi gerekli." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        void reader.cancel();
        throw Response.json({ message: "İstek boyutu çok büyük." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw Response.json({ message: "Geçerli bir JSON nesnesi gerekli." }, { status: 400 });
  } finally { reader.releaseLock(); }
}

async function authRequest(auth: AuthInstance, db: SqliteHandle, request: Request, trustedOrigins: string[], validateSignupEmail: (email: string) => Promise<EmailQualityResult>, abuse: AbuseRiskService, secureCookies: boolean, secret: string): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin ? !trustedOrigins.includes(origin) : request.headers.get("sec-fetch-site") !== "same-origin") {
      return Response.json({ message: "İstek kaynağı doğrulanamadı" }, { status: 403 });
    }
  }
  const signup = request.method === "POST" && url.pathname.endsWith("/sign-up/email");
  if (signup) {
    try {
      if (!admitSignupRequest(db, "signup:route", 100)) return signupAdmissionDenied();
      db.exec(`DELETE FROM auth_signup_admission WHERE window_started_at<=${Math.floor(Date.now()/1000)-60};`);
    } catch { return Response.json({ message: "Kayıt hizmeti geçici olarak hazır değil. Yeniden dene." }, { status: 503 }); }
  }
  const emailRequest = request.method === "POST" && ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/send-verification-email", "/reset-password"].some((path) => url.pathname.endsWith(path));
  let body: Record<string, unknown> | null = null;
  let bodyError: Response | null = null;
  if (emailRequest) {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") bodyError = Response.json({ message: "JSON isteği gerekli." }, { status: 400 });
    else try { body = await readAuthBody(request); } catch (error) { bodyError = error instanceof Response ? error : Response.json({ message: "Geçerli bir JSON nesnesi gerekli." }, { status: 400 }); }
  }
  if (signup && typeof body?.email === "string") {
    const email = normalizeEmailAddress(body.email);
    if (email) {
      const emailKey = "signup:email:" + createHmac("sha256", secret).update(`ispatla-signup-admission:v1\0${email}`).digest("base64url");
      try { if (!admitSignupRequest(db, emailKey, 5)) return signupAdmissionDenied(); }
      catch { return Response.json({ message: "Kayıt hizmeti geçici olarak hazır değil. Yeniden dene." }, { status: 503 }); }
    }
  }
  let attempt: { id: string; cookie: string | null } | null = null;
  if (signup) {
    try {
      const device = abuse.device(request.headers.get("cookie"), { secure: secureCookies || url.protocol === "https:" });
      // Next Request has no trusted peer address; client forwarded headers are not identity evidence.
      const risk = abuse.recordSignupAttempt({ normalizedEmail: typeof body?.email === "string" ? normalizeEmailAddress(body.email) : null, deviceId: device.deviceId, ip: null });
      attempt = { id: risk.attemptId, cookie: device.setCookie };
    } catch {
      return Response.json({ message: "Kayıt hizmeti geçici olarak hazır değil. Yeniden dene." }, { status: 503 });
    }
  }
  async function finish(response: Response): Promise<Response> {
    if (!attempt) return response;
    let ownerId: string | null = null;
    if (response.ok) {
      const result = await response.clone().json().catch(() => null) as { user?: { id?: unknown } } | null;
      if (typeof result?.user?.id === "string" && result.user.id.trim()) ownerId = result.user.id;
    }
    try { abuse.completeSignupAttempt(attempt.id, ownerId); }
    catch { console.error("Signup risk outcome could not be stored; the pending attempt remains available for review."); }
    if (attempt.cookie) response.headers.append("set-cookie", attempt.cookie);
    return response;
  }
  if (bodyError) return finish(bodyError);
  if (request.method === "GET" && url.pathname.endsWith("/verify-email")) {
    const token = url.searchParams.get("token");
    if (token) {
      const callback = url.searchParams.get("callbackURL");
      if (callback) {
        try {
          if (!trustedOrigins.includes(new URL(callback, url.origin).origin)) return Response.json({ message: "Doğrulama bağlantısı geçersiz." }, { status: 403 });
        } catch {
          return Response.json({ message: "Doğrulama bağlantısı geçersiz." }, { status: 400 });
        }
      }
      if (!consumeEmailVerificationToken(db, token)) return Response.json({ message: "Doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş." }, { status: 400 });
    }
  }
  if (body && typeof body.email === "string") {
    if (signup) {
      let quality: EmailQualityResult;
      try { quality = await validateSignupEmail(body.email); }
      catch { return finish(Response.json({ message: "E-posta kontrolü geçici olarak hazır değil. Yeniden dene." }, { status: 503 })); }
      if (!quality.accepted) return finish(Response.json({ message: "Bu e-posta adresi kayıt için uygun görünmüyor." }, { status: 400 }));
      const email = quality.normalizedEmail || normalizeEmailAddress(body.email) || body.email;
      body.email = email;
      body.name = email.trim().split("@")[0];
    } else body.email = normalizeEmailAddress(body.email) || body.email;
  }
  if (body) {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    request = new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), signal: request.signal });
  }
  return finish(await auth.handler(request));
}

export async function createAuthRuntime(input: {
  databasePath?: string;
  env?: Record<string, string | undefined>;
  validateSignupEmail?: (email: string) => Promise<EmailQualityResult>;
} = {}): Promise<AuthRuntime> {
  const env = input.env || process.env;
  // ponytail: test runtimes skip external DNS; inject a validator when exercising signup decisions.
  const validateSignupEmail = input.validateSignupEmail || (env.NODE_ENV === "test"
    ? async (email: string): Promise<EmailQualityResult> => ({ accepted: true, normalizedEmail: email, mxStatus: "unknown" })
    : validateEmailQuality);
  const storagePath = input.databasePath || databasePath(env);
  const db = openDatabase(storagePath);
  try {
    const options = authOptions(db, env, storagePath);
    await migrate(options);
    if (twitterSignInProvider(env)) initializeXOAuthStore(storagePath);
    const auth = betterAuth(options) as AuthInstance;
    const abuse = new AbuseRiskService(db, env.BETTER_AUTH_SECRET!);
    return {
      auth,
      isUserDisabled(userId) {
        const statement = db.prepare?.("SELECT status FROM auth_user_status WHERE owner_user_id=? LIMIT 1");
        return (statement?.get?.(userId) as { status?: string } | undefined)?.status === "disabled";
      },
      disableUser(userId, now) {
        runSql(db, "INSERT INTO auth_user_status(owner_user_id,status,updated_at) VALUES (?, 'disabled', ?) ON CONFLICT(owner_user_id) DO UPDATE SET status='disabled',updated_at=excluded.updated_at", userId, now);
        runSql(db, "DELETE FROM session WHERE userId=?", userId);
      },
      handler: (request) => {
        const context = { grant: null as XLoginGrant | null, ownerUserId: undefined as string | undefined };
        return xLoginGrantContext.run(context, async () => {
          const response = await authRequest(auth, db, request, options.trustedOrigins as string[], validateSignupEmail, abuse, env.NODE_ENV === "production", env.BETTER_AUTH_SECRET!);
          let ownerUserId = context.ownerUserId;
          if (response.ok && new URL(request.url).pathname.endsWith("/sign-in/email")) {
            const body = await response.clone().json().catch(() => null) as { user?: { id?: unknown } } | null;
            if (typeof body?.user?.id === "string") ownerUserId = body.user.id;
          }
          if (response.ok && ownerUserId) runSql(db, "DELETE FROM auth_user_status WHERE owner_user_id=?", ownerUserId);
          return response;
        });
      },
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function initializeAuthDatabase(input: {
  databasePath?: string;
  env?: Record<string, string | undefined>;
} = {}): Promise<void> {
  const env = input.env || process.env;
  const storagePath = input.databasePath || databasePath(env);
  const db = openDatabase(storagePath);
  try {
    await migrate(authOptions(db, env, storagePath));
    if (twitterSignInProvider(env)) initializeXOAuthStore(storagePath);
  } finally {
    db.close();
  }
}

let runtimePromise: Promise<AuthRuntime> | undefined;

async function getRuntime(): Promise<AuthRuntime> {
  runtimePromise ||= createAuthRuntime();
  return runtimePromise;
}

export async function getAuth(): Promise<AuthInstance> {
  return (await getRuntime()).auth;
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  return (await getRuntime()).handler(request);
}

export async function requireSession(request: Request) {
  const runtime = await getRuntime();
  const session = await runtime.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return runtime.isUserDisabled(session.user.id) ? null : session;
}

export async function disableAuthenticatedUser(userId: string): Promise<void> {
  const runtime = await getRuntime();
  runtime.disableUser(userId, Math.floor(Date.now() / 1000));
}

export async function isAuthenticatedUserDisabled(userId: string): Promise<boolean> {
  return (await getRuntime()).isUserDisabled(userId);
}
