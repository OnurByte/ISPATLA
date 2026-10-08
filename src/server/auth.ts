import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { sendAuthEmail } from "./auth-mail";

type SqliteHandle = { exec(sql: string): void; close(): void };
type SqliteConstructor = new (path: string) => SqliteHandle;
type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

type AuthRuntime = {
  auth: AuthInstance;
  handler(request: Request): Promise<Response>;
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

function authOptions(db: SqliteHandle, env: Record<string, string | undefined>): BetterAuthOptions {
  const production = env.NODE_ENV === "production";
  const privateBeta = env.ISPATLA_PRIVATE_BETA === "1";
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

  return {
    appName: "İSPATLA",
    baseURL: baseURL.origin,
    secret,
    trustedOrigins: [...trustedOrigins],
    database: db as NonNullable<BetterAuthOptions["database"]>,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: !privateBeta,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAuthEmail("password-reset", { email: user.email, url }, env),
    },
    emailVerification: {
      sendOnSignUp: !privateBeta,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail("verification", { email: user.email, url }, env),
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
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
      user: {
        create: {
          before: async (user) => ({ data: { ...user, name: user.email.split("@")[0] } }),
        },
      },
    },
  };
}

async function migrate(options: BetterAuthOptions): Promise<void> {
  const migrations = await getMigrations(options);
  if (migrations.unsafeChanges.length || migrations.schemaProblems.length) {
    throw new Error(`Better Auth schema check failed: ${[...migrations.unsafeChanges, ...migrations.schemaProblems].join("; ")}`);
  }
  await migrations.runMigrations();
}

async function authRequest(auth: AuthInstance, request: Request, trustedOrigins: string[]): Promise<Response> {
  const url = new URL(request.url);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin ? !trustedOrigins.includes(origin) : request.headers.get("sec-fetch-site") !== "same-origin") {
      return Response.json({ message: "İstek kaynağı doğrulanamadı" }, { status: 403 });
    }
  }
  if (request.method === "POST" && url.pathname.endsWith("/sign-up/email")
    && request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.clone().json() as Record<string, unknown>;
      if (typeof body.email === "string") {
        body.name = body.email.trim().split("@")[0];
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        request = new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), signal: request.signal });
      }
    } catch {
      // Better Auth returns its normal malformed-body response.
    }
  }
  return auth.handler(request);
}

export async function createAuthRuntime(input: {
  databasePath?: string;
  env?: Record<string, string | undefined>;
} = {}): Promise<AuthRuntime> {
  const env = input.env || process.env;
  const db = openDatabase(input.databasePath || databasePath(env));
  try {
    const options = authOptions(db, env);
    await migrate(options);
    const auth = betterAuth(options) as AuthInstance;
    return {
      auth,
      handler: (request) => authRequest(auth, request, options.trustedOrigins as string[]),
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
  const db = openDatabase(input.databasePath || databasePath(env));
  try {
    await migrate(authOptions(db, env));
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
  const auth = await getAuth();
  return auth.api.getSession({ headers: request.headers });
}
