import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { ensureDatabase } from "./db";
import { X_CONSENT_COPY_VERSION, X_POLICY_VERSION } from "./x-policy";
import { syncUserProfileFromX } from "./db";

type Statement = {
  get(...values: unknown[]): Record<string, unknown> | undefined;
  all(...values: unknown[]): Array<Record<string, unknown>>;
  run(...values: unknown[]): { changes: number; lastInsertRowid: number | bigint };
};
type SqliteDb = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };
type SqliteCtor = new (path: string) => SqliteDb;

const DEFAULT_DB = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
const TX_TTL_SECONDS = 10 * 60;
const REFRESH_LEASE_SECONDS = 30;
const REQUIRED_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;
export const AUTOMATION_ACTIONS = ["post", "repost", "reply", "future_quote"] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];
export type AutomationMode = "shadow" | "manual" | "auto" | "off";

function openDb(path = DEFAULT_DB): SqliteDb {
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  if (!getBuiltinModule) throw new Error("𝕏 OAuth storage requires Node.js 22.5+ or Bun SQLite support");
  const runtime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
    ? getBuiltinModule("bun:sqlite") as { Database: SqliteCtor }
    : getBuiltinModule("node:sqlite") as { DatabaseSync: SqliteCtor };
  mkdirSync(dirname(path), { recursive: true });
  const db = new ("Database" in runtime ? runtime.Database : runtime.DatabaseSync)(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  return db;
}

function init(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_oauth_transactions (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      session_hash TEXT NOT NULL,
      state_hash TEXT NOT NULL UNIQUE,
      encrypted_code_verifier TEXT NOT NULL,
      requested_scopes_json TEXT NOT NULL,
      return_to TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS x_oauth_transactions_expiry_idx ON x_oauth_transactions(expires_at);
    CREATE TABLE IF NOT EXISTS x_oauth_accounts (
      x_user_id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      account_id INTEGER NOT NULL UNIQUE,
      handle TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      auth_state TEXT NOT NULL DEFAULT 'connected',
      connected_at INTEGER NOT NULL,
      last_health_at INTEGER NOT NULL,
      last_auth_error TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS x_oauth_accounts_owner_idx ON x_oauth_accounts(owner_user_id, account_id);
    CREATE TABLE IF NOT EXISTS x_oauth_credentials (
      account_id INTEGER PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      encryption_key_id TEXT NOT NULL,
      access_expires_at INTEGER NOT NULL,
      scopes_json TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 1,
      refreshed_at INTEGER NOT NULL,
      revoked_at INTEGER,
      refresh_lease_id TEXT,
      refresh_lease_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS automation_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      owner_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'shadow',
      policy_version TEXT NOT NULL,
      consent_copy_version TEXT NOT NULL,
      daily_limit INTEGER NOT NULL DEFAULT 0,
      cadence_seconds INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      granted_at INTEGER,
      revoked_at INTEGER,
      updated_at INTEGER NOT NULL,
      UNIQUE(account_id, action_type),
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);
}

export function initializeXOAuthStore(databasePath?: string): void {
  if (!ensureDatabase(databasePath)) throw new Error("application database unavailable");
  const db = openDb(databasePath);
  try { init(db); } finally { db.close(); }
}

export function assertXAccountOwner(input: { xUserId: string; ownerUserId: string; databasePath?: string }): void {
  const db = openDb(input.databasePath);
  try {
    const mapped = db.prepare("SELECT owner_user_id FROM x_oauth_accounts WHERE x_user_id=?").get(input.xUserId);
    if (mapped && mapped.owner_user_id !== input.ownerUserId) throw new Error("𝕏 account is already connected to another user");
  } finally { db.close(); }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function timestamp(value?: number): number { return value ?? Math.floor(Date.now() / 1000); }

let tokenKeyCacheFingerprint = "";
let tokenKeyCache = new Map<string, Buffer>();
function tokenKeys(env: Record<string, string | undefined> = process.env) {
  const currentSecret = env.ISPATLA_TOKEN_KEY_CURRENT || env.ISPATLA_SECRET_KEY;
  if (!currentSecret) throw new Error("ISPATLA_TOKEN_KEY_CURRENT must be configured");
  const previous = Object.entries(env).flatMap(([name, value]) => {
    const match = /^ISPATLA_TOKEN_KEY_PREVIOUS_([A-Za-z0-9_-]+)$/.exec(name);
    return match && value ? [[match[1], value] as const] : [];
  });
  const currentId = env.ISPATLA_TOKEN_KEY_CURRENT ? "current" : "legacy-vault";
  const fingerprint = JSON.stringify([[currentId, currentSecret], ...previous]);
  if (fingerprint !== tokenKeyCacheFingerprint) {
    tokenKeyCacheFingerprint = fingerprint;
    tokenKeyCache = new Map([[currentId, scryptSync(currentSecret, `ispatla-x-token-v1:${currentId}`, 32)],
      ...previous.map(([id, value]) => [id, scryptSync(value, `ispatla-x-token-v1:${id}`, 32)] as const)]);
  }
  return tokenKeyCache;
}

function seal(value: string, env?: Record<string, string | undefined>): { ciphertext: string; keyId: string } {
  const keys = tokenKeys(env);
  const [keyId, key] = keys.entries().next().value as [string, Buffer];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: `v2:${keyId}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`, keyId };
}

function open(value: string, keyIdColumn?: string): string {
  const parts = value.split(":");
  if (parts[0] !== "v2" || parts.length !== 5) throw new Error("invalid 𝕏 credential envelope");
  const [, embeddedKeyId, ivPart, tagPart, ciphertextPart] = parts;
  const keyId = keyIdColumn || embeddedKeyId;
  if (embeddedKeyId !== keyId) throw new Error("𝕏 credential key id mismatch");
  const key = tokenKeys().get(keyId);
  if (!key) throw new Error("𝕏 credential decryption key is not configured");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

export type OAuthTransaction = {
  id: string;
  ownerUserId: string;
  sessionId: string;
  state: string;
  codeVerifier: string;
  scopes: string[];
  returnTo: string;
  expiresAt: number;
};

export function createOAuthTransaction(input: {
  ownerUserId: string; sessionId: string; returnTo: string; now?: number; databasePath?: string;
}): OAuthTransaction {
  const now = timestamp(input.now);
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const transaction = { id: randomUUID(), ownerUserId: input.ownerUserId, sessionId: input.sessionId, state,
    codeVerifier, scopes: [...REQUIRED_SCOPES], returnTo: input.returnTo, expiresAt: now + TX_TTL_SECONDS };
  const db = openDb(input.databasePath);
  try {
    init(db);
    db.prepare(`INSERT INTO x_oauth_transactions
      (id,owner_user_id,session_hash,state_hash,encrypted_code_verifier,requested_scopes_json,return_to,expires_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(transaction.id, input.ownerUserId, hash(input.sessionId), hash(state),
      seal(codeVerifier).ciphertext, JSON.stringify(transaction.scopes), input.returnTo, transaction.expiresAt, now);
  } finally { db.close(); }
  return transaction;
}

/** Atomically consumes the state before any outbound code exchange. */
export function consumeOAuthTransaction(input: {
  state: string; ownerUserId: string; sessionId: string; now?: number; databasePath?: string;
}): Omit<OAuthTransaction, "state" | "sessionId"> | null {
  const db = openDb(input.databasePath);
  try {
    init(db);
    db.exec("BEGIN IMMEDIATE;");
    try {
      const row = db.prepare(`SELECT * FROM x_oauth_transactions WHERE state_hash=? AND owner_user_id=? AND session_hash=?
        AND consumed_at IS NULL AND expires_at>?`).get(hash(input.state), input.ownerUserId, hash(input.sessionId), timestamp(input.now));
      if (!row) { db.exec("ROLLBACK;"); return null; }
      const updated = db.prepare("UPDATE x_oauth_transactions SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(timestamp(input.now), row.id);
      if (updated.changes !== 1) { db.exec("ROLLBACK;"); return null; }
      db.exec("COMMIT;");
      return {
        id: String(row.id), ownerUserId: String(row.owner_user_id), codeVerifier: open(String(row.encrypted_code_verifier)),
        scopes: JSON.parse(String(row.requested_scopes_json)) as string[], returnTo: String(row.return_to), expiresAt: Number(row.expires_at),
      };
    } catch (error) { try { db.exec("ROLLBACK;"); } catch {} throw error; }
  } finally { db.close(); }
}

export type XCredential = {
  accountId: number; ownerUserId: string; xUserId: string; handle: string; displayName: string;
  accessToken: string; refreshToken: string; expiresAt: number; scopes: string[]; version: number;
  authState: string; revokedAt: number | null;
};

function requireConnectedCredential(credential: XCredential | null): XCredential {
  if (!credential) throw new Error("𝕏 account is not connected");
  if (credential.revokedAt !== null || credential.authState === "revoked") throw new Error("𝕏 account is disconnected");
  if (credential.authState !== "connected") throw new Error("𝕏 account requires reauthorization");
  return credential;
}

export function connectXAccount(input: {
  ownerUserId: string; xUserId: string; handle: string; displayName?: string; bio?: string; protected?: boolean | null; avatarUrl?: string | null; accessToken: string; refreshToken: string;
  expiresAt: number; scopes: string[]; now?: number; databasePath?: string; encryptionEnv?: Record<string, string | undefined>;
}): { accountId: number; handle: string; displayName: string; connectedAt: number } {
  if (!/^[0-9]+$/.test(input.xUserId) || !input.accessToken || !input.refreshToken) throw new Error("invalid 𝕏 account grant");
  const missing = REQUIRED_SCOPES.filter((scope) => !input.scopes.includes(scope));
  if (missing.length) throw new Error("required 𝕏 permissions are missing");
  if (!ensureDatabase(input.databasePath)) throw new Error("application database unavailable");
  const now = timestamp(input.now);
  const handle = input.handle.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("invalid 𝕏 username");
  const displayName = (input.displayName || handle).slice(0, 100);
  const accessEnvelope = seal(input.accessToken, input.encryptionEnv);
  const refreshEnvelope = seal(input.refreshToken, input.encryptionEnv);
  const db = openDb(input.databasePath);
  let connected: { accountId: number; handle: string; displayName: string; connectedAt: number };
  try {
    init(db);
    db.exec("BEGIN IMMEDIATE;");
    const mapped = db.prepare("SELECT * FROM x_oauth_accounts WHERE x_user_id=?").get(input.xUserId);
    if (mapped && mapped.owner_user_id !== input.ownerUserId) throw new Error("𝕏 account is already connected to another user");
    const accountKey = `x:${input.xUserId}`;
    const existingAccount = mapped
      ? db.prepare("SELECT id FROM accounts WHERE id=? AND owner_user_id=?").get(Number(mapped.account_id), input.ownerUserId)
      : db.prepare("SELECT id FROM accounts WHERE owner_user_id=? AND (account_key=? OR handle=?) AND NOT EXISTS (SELECT 1 FROM x_oauth_accounts mapped WHERE mapped.account_id=accounts.id) LIMIT 1").get(input.ownerUserId, accountKey, handle);
    let accountId: number;
    if (existingAccount) {
      accountId = Number(existingAccount.id);
      db.prepare("UPDATE accounts SET handle=?,display_name=?,updated_at=? WHERE id=? AND owner_user_id=?")
        .run(handle, displayName, now, accountId, input.ownerUserId);
    } else {
      const ownedCount = db.prepare("SELECT count(*) AS count FROM accounts WHERE owner_user_id=?").get(input.ownerUserId);
      const inserted = db.prepare(`INSERT INTO accounts(account_key,handle,display_name,enabled,default_account,
        automation_mode,daily_limit,capabilities_json,style_profile_json,owner_user_id,updated_at)
        VALUES(?,?,?,1,?,'manual',24,'[]','{}',?,?)`).run(accountKey, handle, displayName,
        Number(ownedCount?.count || 0) === 0 ? 1 : 0, input.ownerUserId, now);
      accountId = Number(inserted.lastInsertRowid);
    }
    db.prepare(`INSERT INTO x_oauth_accounts(x_user_id,owner_user_id,account_id,handle,display_name,auth_state,connected_at,last_health_at,last_auth_error)
      VALUES(?,?,?,?,?,'connected',?,?, '') ON CONFLICT(x_user_id) DO UPDATE SET
      handle=excluded.handle,display_name=excluded.display_name,auth_state='connected',last_health_at=excluded.last_health_at,last_auth_error=''
      WHERE x_oauth_accounts.owner_user_id=excluded.owner_user_id`)
      .run(input.xUserId, input.ownerUserId, accountId, handle, displayName, mapped ? Number(mapped.connected_at) : now, now);
    const existingCredential = db.prepare("SELECT token_version,created_at FROM x_oauth_credentials WHERE account_id=? AND owner_user_id=?").get(accountId, input.ownerUserId);
    db.prepare(`INSERT INTO x_oauth_credentials(account_id,owner_user_id,encrypted_access_token,encrypted_refresh_token,encryption_key_id,
      access_expires_at,scopes_json,token_version,refreshed_at,revoked_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?) ON CONFLICT(account_id) DO UPDATE SET
      encrypted_access_token=excluded.encrypted_access_token,encrypted_refresh_token=excluded.encrypted_refresh_token,
      access_expires_at=excluded.access_expires_at,scopes_json=excluded.scopes_json,
      token_version=x_oauth_credentials.token_version+1,refreshed_at=excluded.refreshed_at,revoked_at=NULL,
      refresh_lease_id=NULL,refresh_lease_until=0,updated_at=excluded.updated_at WHERE x_oauth_credentials.owner_user_id=excluded.owner_user_id`)
      .run(accountId, input.ownerUserId, accessEnvelope.ciphertext, refreshEnvelope.ciphertext, accessEnvelope.keyId,
        input.expiresAt, JSON.stringify([...new Set(input.scopes)]), Number(existingCredential?.token_version ?? 0) + 1, now, Number(existingCredential?.created_at ?? now), now);
    const consentInsert = db.prepare(`INSERT INTO automation_consents(account_id,owner_user_id,action_type,mode,policy_version,consent_copy_version,daily_limit,cadence_seconds,version,granted_at,revoked_at,updated_at)
      VALUES(?,?,?,'shadow',?,?,0,0,1,NULL,NULL,?) ON CONFLICT(account_id,action_type) DO NOTHING`);
    for (const actionType of AUTOMATION_ACTIONS) consentInsert.run(accountId, input.ownerUserId, actionType, X_POLICY_VERSION, X_CONSENT_COPY_VERSION, now);
    db.exec("COMMIT;");
    connected = { accountId, handle, displayName, connectedAt: mapped ? Number(mapped.connected_at) : now };
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    throw error;
  } finally { db.close(); }
  syncUserProfileFromX({ ownerUserId: input.ownerUserId, xUserId: input.xUserId, handle, displayName,
    bio: input.bio || "", protected: input.protected, avatarUrl: input.avatarUrl ?? null, now });
  return connected!;
}

export function getXCredential(accountId: number, ownerUserId: string, databasePath?: string): XCredential | null {
  const db = openDb(databasePath);
  try {
    init(db);
    const row = db.prepare(`SELECT a.x_user_id,a.handle,a.display_name,a.auth_state,c.* FROM x_oauth_accounts a
      JOIN x_oauth_credentials c USING(account_id) WHERE a.account_id=? AND a.owner_user_id=? AND c.owner_user_id=?`).get(accountId, ownerUserId, ownerUserId);
    if (!row) return null;
    const revokedAt = row.revoked_at == null ? null : Number(row.revoked_at);
    return { accountId, ownerUserId, xUserId: String(row.x_user_id), handle: String(row.handle), displayName: String(row.display_name),
      accessToken: revokedAt === null ? open(String(row.encrypted_access_token), String(row.encryption_key_id)) : "",
      refreshToken: revokedAt === null ? open(String(row.encrypted_refresh_token), String(row.encryption_key_id)) : "",
      expiresAt: Number(row.access_expires_at), scopes: JSON.parse(String(row.scopes_json)) as string[], version: Number(row.token_version),
      authState: String(row.auth_state), revokedAt };
  } finally { db.close(); }
}

export function getXAccountAuthState(accountId: number, ownerUserId: string, databasePath?: string) {
  const db = openDb(databasePath);
  try {
    init(db);
    const row = db.prepare(`SELECT a.x_user_id,a.handle,a.display_name,a.auth_state,a.connected_at,a.last_health_at,a.last_auth_error,
      c.access_expires_at,c.scopes_json,c.refreshed_at,c.revoked_at,c.token_version
      FROM x_oauth_accounts a LEFT JOIN x_oauth_credentials c USING(account_id)
      WHERE a.account_id=? AND a.owner_user_id=?`).get(accountId, ownerUserId);
    if (!row) return null;
    const consents = db.prepare(`SELECT action_type,mode,policy_version,consent_copy_version,daily_limit,cadence_seconds,version,granted_at,revoked_at
      FROM automation_consents WHERE account_id=? AND owner_user_id=? ORDER BY action_type`).all(accountId, ownerUserId);
    return { connected: row.revoked_at == null && row.auth_state === "connected", handle: String(row.handle), xUserId: String(row.x_user_id),
      authState: String(row.auth_state), connectedAt: Number(row.connected_at), lastHealthAt: Number(row.last_health_at),
      lastAuthError: String(row.last_auth_error), expiresAt: row.access_expires_at == null ? null : Number(row.access_expires_at),
      scopes: row.scopes_json == null ? [] : JSON.parse(String(row.scopes_json)) as string[], refreshedAt: row.refreshed_at == null ? null : Number(row.refreshed_at),
      tokenVersion: row.token_version == null ? null : Number(row.token_version), consents: consents.map((consent) => ({
        action: String(consent.action_type) as AutomationAction,
        mode: consent.mode === "shadow" ? "observe" : consent.mode === "manual" ? "assist" : String(consent.mode) as AutomationMode | "observe" | "assist",
        policyVersion: String(consent.policy_version), copyVersion: String(consent.consent_copy_version),
        dailyLimit: Number(consent.daily_limit), cadenceSeconds: Number(consent.cadence_seconds), version: Number(consent.version),
        grantedAt: consent.granted_at == null ? null : Number(consent.granted_at), revokedAt: consent.revoked_at == null ? null : Number(consent.revoked_at),
      })) };
  } finally { db.close(); }
}

type AutomationConsentRouteInput = { accountId: number; ownerUserId: string; action: AutomationAction; mode: "observe" | "assist" | "auto" | "off";
  policyVersion: string; copyVersion: string; dailyLimit: number; cadenceSeconds: number; expectedVersion: number; now?: number; databasePath?: string };

export function setAutomationConsent(input: AutomationConsentRouteInput) {
  const action = input.action;
  const copyVersion = input.copyVersion;
  const mode: AutomationMode = input.mode === "observe" ? "shadow" : input.mode === "assist" ? "manual" : input.mode;
  const db = openDb(input.databasePath);
  const now = timestamp(input.now);
  try {
    init(db);
    const existing = db.prepare("SELECT version,revoked_at,mode,granted_at FROM automation_consents WHERE account_id=? AND owner_user_id=? AND action_type=?").get(input.accountId, input.ownerUserId, action);
    if (!existing) throw new Error("account not found");
    if (Number(existing.version) !== input.expectedVersion) throw new Error("consent version conflict");
    if (mode === "auto") {
      const linked = db.prepare(`SELECT 1 FROM x_oauth_accounts a JOIN x_oauth_credentials c USING(account_id)
        WHERE a.account_id=? AND a.owner_user_id=? AND a.auth_state='connected' AND c.revoked_at IS NULL`).get(input.accountId, input.ownerUserId);
      if (!linked) throw new Error("a connected 𝕏 grant is required for automation consent");
    }
    if (!Number.isSafeInteger(input.dailyLimit) || input.dailyLimit < 0 || input.dailyLimit > 1000
      || !Number.isSafeInteger(input.cadenceSeconds) || input.cadenceSeconds < 0 || input.cadenceSeconds > 86400
      || !input.policyVersion.trim() || !copyVersion.trim()) throw new Error("invalid automation consent policy");
    if (mode === "auto" && (input.policyVersion !== X_POLICY_VERSION || copyVersion !== X_CONSENT_COPY_VERSION || input.dailyLimit < 1 || input.cadenceSeconds < 1)) {
      throw new Error("current explicit automation policy consent is required");
    }
    const revoking = mode === "off" || (existing.mode === "auto" && mode !== "auto");
    const nextVersion = Number(existing.version) + 1;
    const result = db.prepare(`UPDATE automation_consents SET mode=?,policy_version=?,consent_copy_version=?,daily_limit=?,cadence_seconds=?,version=?,granted_at=?,revoked_at=?,updated_at=?
      WHERE account_id=? AND owner_user_id=? AND action_type=? AND version=?`).run(mode, input.policyVersion, copyVersion,
      input.dailyLimit, input.cadenceSeconds, nextVersion, mode === "auto" ? now : existing.granted_at ?? null,
      mode === "auto" ? null : revoking ? now : existing.revoked_at ?? null, now, input.accountId, input.ownerUserId, action, input.expectedVersion);
    if (result.changes !== 1) throw new Error("consent version conflict");
    return { action, mode: input.mode, version: nextVersion, policyVersion: input.policyVersion,
      copyVersion, dailyLimit: input.dailyLimit, cadenceSeconds: input.cadenceSeconds,
      grantedAt: mode === "auto" ? now : existing.granted_at ?? null,
      revokedAt: mode === "auto" ? null : revoking ? now : existing.revoked_at ?? null };
  } finally { db.close(); }
}

export function disconnectXAccount(input: { accountId: number; ownerUserId: string; now?: number; databasePath?: string }) {
  const db = openDb(input.databasePath);
  const now = timestamp(input.now);
  try {
    init(db);
    db.exec("BEGIN IMMEDIATE;");
    const account = db.prepare("SELECT x_user_id FROM x_oauth_accounts WHERE account_id=? AND owner_user_id=?").get(input.accountId, input.ownerUserId);
    if (!account) { db.exec("ROLLBACK;"); return false; }
    db.prepare(`UPDATE x_oauth_credentials SET revoked_at=?,encrypted_access_token='',encrypted_refresh_token='',token_version=token_version+1,refresh_lease_id=NULL,refresh_lease_until=0,updated_at=?
      WHERE account_id=? AND owner_user_id=?`).run(now, now, input.accountId, input.ownerUserId);
    db.prepare(`UPDATE x_oauth_accounts SET auth_state='revoked',last_auth_error='',last_health_at=? WHERE account_id=? AND owner_user_id=?`).run(now, input.accountId, input.ownerUserId);
    db.prepare(`UPDATE automation_consents SET mode=CASE WHEN mode='auto' THEN 'off' ELSE mode END,version=version+1,
      revoked_at=CASE WHEN mode='auto' THEN ? ELSE revoked_at END,updated_at=? WHERE account_id=? AND owner_user_id=?`)
      .run(now, now, input.accountId, input.ownerUserId);
    db.exec("COMMIT;");
    return true;
  } catch (error) { try { db.exec("ROLLBACK;"); } catch {} throw error; }
  finally { db.close(); }
}

export async function withXTokenRefresh<T>(input: {
  accountId: number; ownerUserId: string; refresh: (refreshToken: string, current: XCredential) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] }>;
  now?: () => number; databasePath?: string; bufferSeconds?: number; waitMs?: number;
}, work: (credential: XCredential) => Promise<T>): Promise<T> {
  const nowFn = input.now || (() => Math.floor(Date.now() / 1000));
  const path = input.databasePath;
  const buffer = input.bufferSeconds ?? 120;
  const waitMs = input.waitMs ?? 20;
  const initial = requireConnectedCredential(getXCredential(input.accountId, input.ownerUserId, path));
  if (initial.expiresAt > nowFn() + buffer) return work(initial);

  const leaseId = randomUUID();
  const deadline = Date.now() + REFRESH_LEASE_SECONDS * 1000;
  while (Date.now() < deadline) {
    const db = openDb(path);
    let claimed = false;
    try {
      init(db);
      db.exec("BEGIN IMMEDIATE;");
      const row = db.prepare(`SELECT token_version,access_expires_at,revoked_at,refresh_lease_until FROM x_oauth_credentials
        WHERE account_id=? AND owner_user_id=?`).get(input.accountId, input.ownerUserId);
      if (!row || row.revoked_at != null) { db.exec("ROLLBACK;"); throw new Error("𝕏 account is disconnected"); }
      if (Number(row.access_expires_at) > nowFn() + buffer) { db.exec("COMMIT;"); }
      else if (Number(row.refresh_lease_until) <= nowFn()) {
        const update = db.prepare(`UPDATE x_oauth_credentials SET refresh_lease_id=?,refresh_lease_until=? WHERE account_id=? AND owner_user_id=?
          AND token_version=? AND revoked_at IS NULL AND refresh_lease_until<=?`).run(leaseId, nowFn() + REFRESH_LEASE_SECONDS,
          input.accountId, input.ownerUserId, Number(row.token_version), nowFn());
        claimed = update.changes === 1;
        db.exec("COMMIT;");
      } else db.exec("COMMIT;");
      if (!claimed && Number(row.access_expires_at) <= nowFn() + buffer) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (!claimed) {
        const latest = requireConnectedCredential(getXCredential(input.accountId, input.ownerUserId, path));
        if (latest.expiresAt <= nowFn() + buffer) { await new Promise((resolve) => setTimeout(resolve, waitMs)); continue; }
        return work(latest);
      }
    } catch (error) { try { db.exec("ROLLBACK;"); } catch {} throw error; }
    finally { db.close(); }

    const current = requireConnectedCredential(getXCredential(input.accountId, input.ownerUserId, path));
    try {
      const refreshed = await input.refresh(current.refreshToken, current);
      const nextScopes = [...new Set(refreshed.scopes)];
      const missing = REQUIRED_SCOPES.filter((scope) => !nextScopes.includes(scope));
      if (missing.length) throw new Error("required 𝕏 permissions are missing");
      const db = openDb(path);
      try {
        init(db);
        const accessEnvelope = seal(refreshed.accessToken);
        const refreshEnvelope = seal(refreshed.refreshToken);
        const saved = db.prepare(`UPDATE x_oauth_credentials SET encrypted_access_token=?,encrypted_refresh_token=?,encryption_key_id=?,access_expires_at=?,scopes_json=?,
          token_version=token_version+1,refreshed_at=?,updated_at=?,refresh_lease_id=NULL,refresh_lease_until=0
          WHERE account_id=? AND owner_user_id=? AND token_version=? AND refresh_lease_id=? AND revoked_at IS NULL`)
          .run(accessEnvelope.ciphertext, refreshEnvelope.ciphertext, accessEnvelope.keyId, refreshed.expiresAt, JSON.stringify(nextScopes),
            nowFn(), nowFn(), input.accountId, input.ownerUserId, current.version, leaseId);
        if (saved.changes !== 1) {
          const latest = requireConnectedCredential(getXCredential(input.accountId, input.ownerUserId, path));
          if (latest.expiresAt <= nowFn() + buffer) throw new Error("𝕏 token refresh lost its lease");
        } else {
          db.prepare(`UPDATE x_oauth_accounts SET auth_state='connected',last_auth_error='',last_health_at=?
            WHERE account_id=? AND owner_user_id=? AND auth_state<>'revoked'`).run(nowFn(), input.accountId, input.ownerUserId);
        }
      } finally { db.close(); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "refresh failed";
      const invalidGrant = /invalid_grant/i.test(message);
      const db = openDb(path);
      try {
        init(db);
        db.prepare(`UPDATE x_oauth_accounts SET auth_state=?,last_auth_error=?,last_health_at=? WHERE account_id=? AND owner_user_id=?
          AND EXISTS(SELECT 1 FROM x_oauth_credentials WHERE account_id=? AND owner_user_id=? AND refresh_lease_id=? AND revoked_at IS NULL)`)
          .run(invalidGrant ? "reauthorization_required" : "connected", invalidGrant ? "reauthorization_required" : "refresh_failed", nowFn(),
            input.accountId, input.ownerUserId, input.accountId, input.ownerUserId, leaseId);
        db.prepare(`UPDATE x_oauth_credentials SET refresh_lease_id=NULL,refresh_lease_until=0 WHERE account_id=? AND owner_user_id=? AND refresh_lease_id=? AND revoked_at IS NULL`)
          .run(input.accountId, input.ownerUserId, leaseId);
      } finally { db.close(); }
      throw error;
    }
    const latest = requireConnectedCredential(getXCredential(input.accountId, input.ownerUserId, path));
    return work(latest);
  }
  throw new Error("𝕏 token refresh lease timed out");
}

export const xOAuthStorageInternals = { openDb, init, hash, requiredScopes: REQUIRED_SCOPES, transactionTtlSeconds: TX_TTL_SECONDS };

/** A rejected credential immediately disables writes without exposing its token. */
export function markXAccountReauthorizationRequired(accountId: number, ownerUserId: string): boolean {
  const db = openDb();
  const now = timestamp();
  try {
    init(db);
    db.exec('BEGIN IMMEDIATE;');
    const changed = db.prepare("UPDATE x_oauth_accounts SET auth_state='reauthorization_required',last_auth_error='reauth',last_health_at=? WHERE account_id=? AND owner_user_id=?").run(now,accountId,ownerUserId).changes;
    if (changed) db.prepare('UPDATE x_oauth_credentials SET token_version=token_version+1,refresh_lease_id=NULL,refresh_lease_until=0,updated_at=? WHERE account_id=? AND owner_user_id=?').run(now,accountId,ownerUserId);
    db.exec('COMMIT;'); return changed===1;
  } catch (error) { try {db.exec('ROLLBACK;');}catch{} throw error; }
  finally {db.close();}
}
