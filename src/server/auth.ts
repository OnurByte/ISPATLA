/**
 * Operator sign-in: scrypt password digests and opaque session cookies.
 *
 * The reverse proxy used to hold the only credential, so the application had no
 * identity of its own and no login screen. Now the app owns authentication end to
 * end and the proxy only terminates TLS.
 *
 * Design notes:
 *  - Passwords never leave this module. `hashPassword` produces a scrypt digest
 *    over a 16-byte random salt; `verifyPassword` is a constant-time compare, so
 *    a wrong password and an unknown user cost the same.
 *  - The browser receives an opaque random id in an httpOnly, Secure,
 *    SameSite=Strict cookie. Only its HMAC is sent to the server, so a leaked
 *    database row cannot be replayed as a cookie and the raw value never appears
 *    in a log line.
 *  - A disabled user is rejected at sign-in AND at every session lookup, so
 *    disabling one takes effect on the next request rather than at expiry.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
export const SESSION_COOKIE = "isp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export interface StoredUser {
  id: number;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  role: string;
  disabled: number;
}

export interface SessionRecord {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: number;
  username: string;
  role: string;
}

function sessionSecret(): string {
  return process.env.ISPATLA_SECRET_KEY || "isp-atla-dev-secret";
}

export function hashPassword(password: string, salt = randomBytes(SALT_BYTES).toString("hex")): {
  hash: string;
  salt: string;
} {
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(hash, "hex");
    actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * A session cookie is `<id>.<hmac>`: the row id, then a keyed signature of it.
 *
 * Keeping the id in the cookie lets a session be revoked server-side without a
 * second lookup key, and the signature is what proves the cookie was issued here
 * rather than guessed. The database stores the same signature, so a row read out
 * of a backup still cannot be turned into a working cookie without the key.
 */
export function newSessionToken(): { id: string; cookie: string } {
  const id = randomBytes(24).toString("hex");
  return { id, cookie: `${id}.${signSession(id)}` };
}

export function splitSessionCookie(value: string | null): { id: string; signature: string } | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!id || !signature) return null;
  return { id, signature };
}

export function signSession(id: string): string {
  return createHmac("sha256", sessionSecret()).update(id).digest("hex");
}

export function isSessionTokenValid(id: string, token: string): boolean {
  const expected = Buffer.from(signSession(id));
  const received = Buffer.from(token || "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function sessionExpiry(now = Math.floor(Date.now() / 1000)): number {
  return now + SESSION_TTL_SECONDS;
}

/** Extracts the raw session cookie from a Cookie header, without a web framework. */
export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
}

export function sessionCookieHeader(cookie: string, maxAgeSeconds = SESSION_TTL_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearedSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
