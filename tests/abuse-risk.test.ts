import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

let activeRows: Array<Record<string, unknown>> = [];
const dialect = new PgDialect();
const execute = async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
  const { sql, params } = dialect.sqlToQuery(query);
  if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
  if (sql.startsWith("DELETE FROM ispatla_auth.auth_abuse_signup_signals")) {
    const expired = Number(params[0]);
    const candidates = activeRows.filter((row) => Number(row.created_at) <= expired).sort((a, b) => Number(a.created_at) - Number(b.created_at)).slice(0, 1000);
    for (const row of candidates) activeRows.splice(activeRows.indexOf(row), 1);
    return { rows: [], rowCount: candidates.length };
  }
  if (sql.startsWith("INSERT INTO ispatla_auth.auth_abuse_signup_signals")) {
    activeRows.push({ id: params[0], email_hash: params[1], device_hash: params[2], ip_hash: params[3], created_at: params[4], risk: "normal", outcome: "pending", owner_user_id: null });
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("SELECT") && sql.includes("FROM ispatla_auth.auth_abuse_signup_signals")) {
    const counts = activeRows.filter((row) => Number(row.created_at) > Number(params[3]) && Number(row.created_at) <= Number(params[4]));
    return { rows: [{
      email: counts.filter((row) => params[0] !== null && row.email_hash === params[0]).length,
      device: counts.filter((row) => params[1] !== null && row.device_hash === params[1]).length,
      ip: counts.filter((row) => params[2] !== null && row.ip_hash === params[2]).length,
    }], rowCount: 1 };
  }
  if (sql.startsWith("UPDATE ispatla_auth.auth_abuse_signup_signals SET risk")) {
    const row = activeRows.find((item) => item.id === params[1]);
    if (row) row.risk = params[0];
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  if (sql.startsWith("UPDATE ispatla_auth.auth_abuse_signup_signals SET owner_user_id")) {
    const row = activeRows.find((item) => item.id === params[2] && item.outcome === "pending");
    if (row) { row.owner_user_id = params[0]; row.outcome = params[1]; }
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  throw new Error(`Unexpected SQL in fixture: ${sql}`);
};
const fakeDb = { execute, transaction: async <T>(callback: (tx: { execute: typeof execute }) => Promise<T>) => callback({ execute }) };
mock.module("../src/server/postgres", () => ({ getPostgresDb: () => fakeDb }));
const { AbuseRiskService } = await import("../src/server/abuse-risk");

const secret = "test-abuse-secret-at-least-32-characters";
const now = 1_800_000_000_000;

function fixtureRows(): Array<Record<string, unknown>> {
  activeRows = [];
  return activeRows;
}

test("first-party device cookies are signed, secure, expiring and reject forgery", () => {
  const service = new AbuseRiskService(secret);
  const first = service.device(null, { now, secure: true });
  expect(Buffer.from(first.deviceId, "base64url")).toHaveLength(32);
  expect(first.setCookie).toContain("Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure");
  const cookie = first.setCookie!.split(";")[0];
  expect(service.device(cookie, { now: now + 1, secure: true })).toEqual({ deviceId: first.deviceId, setCookie: null });
  for (const badCookie of [cookie.replace(first.deviceId, "a".repeat(43)), cookie + "a", `ispatla-device=${"a".repeat(500)}`, `${cookie}; ${cookie}`]) {
    const replaced = service.device(badCookie, { now, secure: true });
    expect(replaced.deviceId).not.toBe(first.deviceId);
    expect(replaced.setCookie).not.toBeNull();
  }
  expect(service.device(cookie, { now: now + 30 * 24 * 60 * 60 * 1000, secure: true }).setCookie).not.toBeNull();
  expect(service.device(cookie, { now: now - 1, secure: true }).setCookie).not.toBeNull();
  expect(new AbuseRiskService("another-key-at-least-32-characters-long").device(cookie, { now, secure: true }).setCookie).not.toBeNull();
  expect(service.device(null, { now, secure: false }).setCookie).not.toContain("; Secure");
});

test("combined velocity signals are observational, hashed, owner-bound and expire", async () => {
  const rows = fixtureRows();
  const service = new AbuseRiskService(secret);
  for (let i = 0; i < 6; i++) {
    const result = await service.recordSignupAttempt({ normalizedEmail: `different-${i}@example.org`, deviceId: "shared-browser", ip: null, now });
    expect(result.risk).toBe("normal");
    expect(result.reason).toBeNull();
    expect("block" in result).toBe(false);
  }
  for (let i = 0; i < 6; i++) {
    expect((await service.recordSignupAttempt({ normalizedEmail: null, deviceId: null, ip: "192.0.2.9", now })).risk).toBe("normal");
    expect((await service.recordSignupAttempt({ normalizedEmail: "email-only@example.org", deviceId: null, ip: null, now })).risk).toBe("normal");
  }
  let attemptId = "";
  for (let i = 0; i < 3; i++) {
    const result = await service.recordSignupAttempt({ normalizedEmail: "reused@example.org", deviceId: "repeated-device", ip: "192.0.2.8", now });
    attemptId = result.attemptId;
    expect(result.risk).toBe(i === 2 ? "review" : "normal");
  }
  const dump = JSON.stringify(rows);
  for (const raw of ["@example.org", "shared-browser", "repeated-device", "192.0.2.8"]) expect(dump).not.toContain(raw);
  expect(rows.find((row) => row.id === attemptId)?.owner_user_id).toBeNull();
  await service.completeSignupAttempt(attemptId, "actual-auth-owner");
  await service.completeSignupAttempt(attemptId, "another-owner");
  expect(rows.find((row) => row.id === attemptId)).toMatchObject({ owner_user_id: "actual-auth-owner", outcome: "success" });
  const later = await service.recordSignupAttempt({ normalizedEmail: "reused@example.org", deviceId: "repeated-device", ip: "192.0.2.8", now: now + 10 * 60 * 1000 });
  expect(later.counts).toEqual({ email: 1, device: 1, ip: 1 });
  await service.completeSignupAttempt(later.attemptId, null);
  expect(rows.find((row) => row.id === later.attemptId)).toMatchObject({ outcome: "failed", owner_user_id: null });
  await service.pruneExpired(now + 24 * 60 * 60 * 1000);
  expect(rows).toHaveLength(1);
  await service.pruneExpired(now + 24 * 60 * 60 * 1000 + 10 * 60 * 1000);
  expect(rows).toHaveLength(0);
});
