/**
 * Persistence for operator accounts and sessions.
 *
 * Follows the same convention as the rest of `db.ts`: the SQL lives here, next to
 * the credential rules in `auth.ts`, and only typed accessors are exported. Every
 * value is bound as a parameter; a username is never interpolated into SQL.
 *
 * The session row stores an HMAC of the cookie token, never the token itself, so
 * a database dump cannot be replayed as a live login.
 */

import { hashPassword, isSessionTokenValid, newSessionToken, sessionExpiry, signSession } from "./auth";
import { isDatabaseOpen, runStatement, selectRows } from "./db";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export interface PublicUser {
  id: number;
  username: string;
  role: string;
}

export interface SessionRecord {
  id: string;
  userId: number;
  username: string;
  role: string;
  expiresAt: number;
}

export interface SessionSummary {
  id: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  role: string;
  disabled: number;
}

interface SessionRow {
  id: string;
  user_id: number;
  token_hash: string;
  expires_at: number;
  username: string;
  role: string;
  disabled: number;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function isValidPassword(value: string): boolean {
  return value.length >= 10 && value.length <= 200;
}

function requireOpen(): void {
  if (!isDatabaseOpen()) throw new Error("database connection unavailable");
}

export function countUsers(): number {
  requireOpen();
  return selectRows<{ n: number }>("SELECT COUNT(*) AS n FROM users;")[0]?.n ?? 0;
}

export function findUserByUsername(username: string): UserRow | null {
  requireOpen();
  return selectRows<UserRow>("SELECT * FROM users WHERE username = ?;", [normalizeUsername(username)])[0] ?? null;
}

export function listUsers(): PublicUser[] {
  requireOpen();
  return selectRows<{ id: number; username: string; role: string; disabled: number }>(
    "SELECT id, username, role, disabled FROM users ORDER BY id;",
  ).map((row) => ({ id: row.id, username: row.username, role: row.disabled ? "disabled" : row.role }));
}

export function createUser(username: string, password: string, role = "admin"): PublicUser {
  requireOpen();
  const normalized = normalizeUsername(username);
  const { hash, salt } = hashPassword(password);
  runStatement("INSERT INTO users (username, password_hash, password_salt, role, disabled, created_at) VALUES (?, ?, ?, ?, 0, unixepoch());", [
    normalized,
    hash,
    salt,
    role,
  ]);
  const created = findUserByUsername(normalized);
  if (!created) throw new Error("user insert did not persist");
  return { id: created.id, username: created.username, role: created.role };
}

export function setUserPassword(userId: number, password: string): void {
  requireOpen();
  const { hash, salt } = hashPassword(password);
  runStatement("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?;", [hash, salt, userId]);
}

export function setUserDisabled(userId: number, disabled: boolean): void {
  requireOpen();
  runStatement("UPDATE users SET disabled = ? WHERE id = ?;", [disabled ? 1 : 0, userId]);
}

/** Creates a session row and returns the token to hand to the browser. */
export function createSession(userId: number, userAgent: string, now = Math.floor(Date.now() / 1000)): string {
  requireOpen();
  const { id, cookie } = newSessionToken();
  runStatement("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?);", [
    id,
    userId,
    signSession(id),
    now,
    sessionExpiry(now),
    userAgent.slice(0, 300),
  ]);
  return cookie;
}

/**
 * Resolves a cookie to a live session.
 *
 * A disabled account is rejected here, not only at sign-in, so disabling a user
 * takes effect on their next request rather than at cookie expiry. Expired and
 * revoked rows count as absent, and a token whose HMAC does not match is never
 * returned even when the row exists.
 */
export function resolveSession(sessionId: string, signature: string, now = Math.floor(Date.now() / 1000)): SessionRecord | null {
  requireOpen();
  if (!sessionId || !isSessionTokenValid(sessionId, signature)) return null;
  const rows = selectRows<SessionRow>(
    `SELECT s.id, s.user_id, s.token_hash, s.expires_at, u.username, u.role, u.disabled
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.revoked_at IS NULL;`,
    [sessionId],
  );
  const row = rows[0];
  if (!row || row.disabled || row.expires_at <= now) return null;
  return { id: row.id, userId: row.user_id, username: row.username, role: row.role, expiresAt: row.expires_at };
}

export function revokeSession(sessionId: string): void {
  requireOpen();
  runStatement("UPDATE sessions SET revoked_at = unixepoch() WHERE id = ? AND revoked_at IS NULL;", [sessionId]);
}

export function revokeAllSessionsForUser(userId: number): void {
  requireOpen();
  runStatement("UPDATE sessions SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL;", [userId]);
}

export function recordLogin(userId: number): void {
  requireOpen();
  runStatement("UPDATE users SET last_login_at = unixepoch() WHERE id = ?;", [userId]);
}

export function listSessions(userId?: number): SessionSummary[] {
  requireOpen();
  return selectRows<{ id: string; username: string; created_at: number; expires_at: number }>(
    `SELECT s.id, u.username, s.created_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL AND s.expires_at > unixepoch() ${userId === undefined ? "" : "AND s.user_id = ?"}
     ORDER BY s.created_at DESC;`,
    userId === undefined ? [] : [userId],
  ).map((row) => ({ id: row.id, username: row.username, createdAt: row.created_at, expiresAt: row.expires_at }));
}

export function deleteExpiredSessions(now = Math.floor(Date.now() / 1000)): number {
  requireOpen();
  const before = selectRows<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE expires_at < ?;", [now])[0]?.n ?? 0;
  runStatement("DELETE FROM sessions WHERE expires_at < ?;", [now]);
  return before;
}
