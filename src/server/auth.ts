import { createHash, createHmac } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { APIError, betterAuth, type BetterAuthOptions } from "better-auth";
import { sql } from "drizzle-orm";
import { sendAuthEmail } from "./auth-mail";
import { AbuseRiskService } from "./abuse-risk";
import { getPostgresDb } from "./postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authSchema } from "./postgres-auth-schema";
import { normalizeEmailAddress, validateEmailQuality, type EmailQualityResult } from "./email-validation";
import { assertPostgresXAccountOwner, connectPostgresXAccount } from "./postgres-x-oauth";

type XLoginGrant = { xUserId: string; handle: string; displayName: string; bio: string; protected: boolean | null; avatarSource: string | null; accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
const xLoginGrantContext = new AsyncLocalStorage<{ grant: XLoginGrant | null; ownerUserId?: string }>();
const X_PUBLISHING_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;

type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

type AuthRuntime = {
  auth: AuthInstance;
  handler(request: Request): Promise<Response>;
  isUserDisabled(userId: string): Promise<boolean>;
  disableUser(userId: string, now: number): Promise<void>;
  close(): void;
};

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function registerEmailVerificationToken(userId: string, token: string): Promise<void> {
  const now = Date.now();
  const db = getPostgresDb();
  await db.execute(sql`DELETE FROM ispatla_auth.auth_email_verification_tokens WHERE expires_at <= ${now}`);
  await db.execute(sql`INSERT INTO ispatla_auth.auth_email_verification_tokens(token_hash,user_id,expires_at)
    VALUES (${tokenDigest(token)},${userId},${now + 60 * 60 * 1000})
    ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,expires_at=EXCLUDED.expires_at`);
}

async function consumeEmailVerificationToken(token: string): Promise<boolean> {
  const result = await getPostgresDb().execute(sql`DELETE FROM ispatla_auth.auth_email_verification_tokens WHERE token_hash = ${tokenDigest(token)} AND expires_at > ${Date.now()}`);
  return result.rowCount === 1;
}

function twitterSignInProvider(env: Record<string, string | undefined>): BetterAuthOptions["socialProviders"] {
  const clientId = env.X_OAUTH_CLIENT_ID;
  const clientSecret = env.X_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return { twitter: {
    clientId,
    clientSecret,
    redirectURI: `${env.BETTER_AUTH_URL || (env.NODE_ENV === "production" ? "" : "http://localhost:3000")}/api/auth/callback/twitter`,
    disableDefaultScope: true,
    scope: [...X_PUBLISHING_SCOPES],
    getUserInfo: async (tokens) => {
      try {
        const accessToken = tokens.accessToken;
        if (!accessToken) return null;
        const response = await fetch("https://api.x.com/2/users/me?user.fields=description,profile_image_url,protected", {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const profile = await response.json() as { data?: { id?: unknown; name?: unknown; username?: unknown; description?: unknown; profile_image_url?: unknown; protected?: unknown } };
        const user = profile.data;
        if (typeof user?.id !== "string" || typeof user.name !== "string" || typeof user.username !== "string") return null;
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
          protected: typeof user.protected === "boolean" ? user.protected : null,
          avatarSource: typeof user.profile_image_url === "string" ? user.profile_image_url : null,
          accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Math.floor(tokens.accessTokenExpiresAt.getTime() / 1000),
          scopes,
        };
        return {
          user: { name: user.name, email: `x-${user.id}@users.ispatla.invalid`, emailVerified: true },
          data: { data: { id: user.id, name: user.name, username: user.username, email: `x-${user.id}@users.ispatla.invalid` } },
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

function authOptions(env: Record<string, string | undefined>): BetterAuthOptions {
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
    database: drizzleAdapter(getPostgresDb(), { provider: "pg", schema: authSchema, camelCase: true, schemaName: "ispatla_auth" }),
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
        await registerEmailVerificationToken(user.id, token);
        await sendAuthEmail("verification", { email: user.email, url }, env);
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async () => {
          // Do not delete auth rows while any owner data or provider grant may remain outside this schema.
          throw new APIError("SERVICE_UNAVAILABLE", { code: "account_deletion_unavailable", message: "Account deletion is unavailable until all account data and provider grants are stored in PostgreSQL." });
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
      expiresIn: 60 * 60 * 24 * 60,
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
            if (account.providerId === "twitter" && typeof account.accountId === "string" && typeof account.userId === "string") {
              await assertPostgresXAccountOwner({ xUserId: account.accountId, ownerUserId: account.userId });
            }
            return { data: stripTwitterTokens(account) };
          },
          after: async (account) => provisionXLoginAccount(account, env),
        },
        update: {
          before: async (account) => {
            const grant = xLoginGrantContext.getStore()?.grant;
            if (account.providerId === "twitter" && grant && account.accountId !== undefined && grant.xUserId !== account.accountId) throw new Error("X login grant did not match the authenticated account");
            return { data: stripTwitterTokens(account) };
          },
          after: async (account) => provisionXLoginAccount(account, env),
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

async function provisionXLoginAccount(account: unknown, env: Record<string, string | undefined>): Promise<void> {
  if (!account || typeof account !== "object") return;
  const row = account as Record<string, unknown>;
  const grant = xLoginGrantContext.getStore()?.grant;
  if (row.providerId !== "twitter") return;
  if (typeof row.userId !== "string" || !grant || row.accountId !== grant.xUserId) {
    throw new APIError("INTERNAL_SERVER_ERROR", { code: "x_account_provision_failed", message: "X account connection could not be completed" });
  }
  xLoginGrantContext.getStore()!.ownerUserId = row.userId;
  try { await connectPostgresXAccount({ ...grant, ownerUserId: row.userId, env }); }
  catch { throw new APIError("INTERNAL_SERVER_ERROR", { code: "x_account_provision_failed", message: "X account connection could not be completed" }); }
}

// Without a verified peer address, the shared route ceiling bounds preflight work across all clients.
async function admitSignupRequest(key: string, max: number, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const result = await getPostgresDb().execute(sql`INSERT INTO ispatla_auth.auth_signup_admission AS admission(key,count,window_started_at) VALUES(${key},1,${now})
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN admission.window_started_at <= ${now - 60} THEN 1 ELSE admission.count+1 END,
      window_started_at=CASE WHEN admission.window_started_at <= ${now - 60} THEN EXCLUDED.window_started_at ELSE admission.window_started_at END
      WHERE admission.window_started_at <= ${now - 60} OR admission.count < ${max} RETURNING count`);
  return result.rows.length === 1;
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

async function authRequest(auth: AuthInstance, request: Request, trustedOrigins: string[], validateSignupEmail: (email: string) => Promise<EmailQualityResult>, abuse: AbuseRiskService, secureCookies: boolean, secret: string): Promise<Response> {
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
      if (!await admitSignupRequest("signup:route", 100)) return signupAdmissionDenied();
      await getPostgresDb().execute(sql`DELETE FROM ispatla_auth.auth_signup_admission WHERE window_started_at <= ${Math.floor(Date.now()/1000)-60}`);
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
      try { if (!await admitSignupRequest(emailKey, 5)) return signupAdmissionDenied(); }
      catch { return Response.json({ message: "Kayıt hizmeti geçici olarak hazır değil. Yeniden dene." }, { status: 503 }); }
    }
  }
  let attempt: { id: string; cookie: string | null } | null = null;
  if (signup) {
    try {
      const device = abuse.device(request.headers.get("cookie"), { secure: secureCookies || url.protocol === "https:" });
      // Next Request has no trusted peer address; client forwarded headers are not identity evidence.
      const risk = await abuse.recordSignupAttempt({ normalizedEmail: typeof body?.email === "string" ? normalizeEmailAddress(body.email) : null, deviceId: device.deviceId, ip: null });
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
    try { await abuse.completeSignupAttempt(attempt.id, ownerId); }
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
      if (!await consumeEmailVerificationToken(token)) return Response.json({ message: "Doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş." }, { status: 400 });
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
  env?: Record<string, string | undefined>;
  validateSignupEmail?: (email: string) => Promise<EmailQualityResult>;
} = {}): Promise<AuthRuntime> {
  const env = input.env || process.env;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL auth");
  // ponytail: test runtimes skip external DNS; inject a validator when exercising signup decisions.
  const validateSignupEmail = input.validateSignupEmail || (env.NODE_ENV === "test"
    ? async (email: string): Promise<EmailQualityResult> => ({ accepted: true, normalizedEmail: email, mxStatus: "unknown" })
    : validateEmailQuality);
  const db = getPostgresDb();
  const options = authOptions(env);
  await verifyAuthTables();
  const auth = betterAuth(options) as AuthInstance;
  const abuse = new AbuseRiskService(env.BETTER_AUTH_SECRET!);
  return {
    auth,
    async isUserDisabled(userId) {
      const result = await db.execute(sql`SELECT status FROM ispatla_auth.auth_user_status WHERE owner_user_id=${userId} LIMIT 1`);
      return result.rows[0]?.status === "disabled";
    },
    async disableUser(userId, now) {
      await db.execute(sql`INSERT INTO ispatla_auth.auth_user_status(owner_user_id,status,updated_at) VALUES (${userId},'disabled',${now}) ON CONFLICT(owner_user_id) DO UPDATE SET status='disabled',updated_at=EXCLUDED.updated_at`);
      await db.execute(sql`DELETE FROM ispatla_auth.session WHERE "userId"=${userId}`);
    },
    handler: (request) => {
      const context = { grant: null as XLoginGrant | null, ownerUserId: undefined as string | undefined };
      return xLoginGrantContext.run(context, async () => {
        const response = await authRequest(auth, request, options.trustedOrigins as string[], validateSignupEmail, abuse, env.NODE_ENV === "production", env.BETTER_AUTH_SECRET!);
        let ownerUserId = context.ownerUserId;
        if (response.ok && new URL(request.url).pathname.endsWith("/sign-in/email")) {
          const body = await response.clone().json().catch(() => null) as { user?: { id?: unknown } } | null;
          if (typeof body?.user?.id === "string") ownerUserId = body.user.id;
        }
        if (response.ok && ownerUserId) await db.execute(sql`DELETE FROM ispatla_auth.auth_user_status WHERE owner_user_id=${ownerUserId}`);
        return response;
      });
    },
    close: () => {},
  };
}

export async function initializeAuthDatabase(input: {
  env?: Record<string, string | undefined>;
} = {}): Promise<void> {
  const env = input.env || process.env;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL auth");
  await verifyAuthTables();
}

async function verifyAuthTables(): Promise<void> {
  const db = getPostgresDb();
  await db.execute(sql`SELECT 1 FROM ispatla_auth.auth_user_status LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.auth_signup_admission LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.auth_abuse_signup_signals LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.auth_email_verification_tokens LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth."user" LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.session LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.account LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth.verification LIMIT 0`);
  await db.execute(sql`SELECT 1 FROM ispatla_auth."rateLimit" LIMIT 0`);
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
  return await runtime.isUserDisabled(session.user.id) ? null : session;
}

export async function disableAuthenticatedUser(userId: string): Promise<void> {
  const runtime = await getRuntime();
  await runtime.disableUser(userId, Math.floor(Date.now() / 1000));
}

export async function isAuthenticatedUserDisabled(userId: string): Promise<boolean> {
  return await (await getRuntime()).isUserDisabled(userId);
}
