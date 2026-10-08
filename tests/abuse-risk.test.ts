import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AbuseRiskService } from "../src/server/abuse-risk";

const secret = "test-abuse-secret-at-least-32-characters";
const now = 1_800_000_000_000;

test("first-party device cookies are signed, secure, expiring and reject forgery", () => {
  const db = new Database(":memory:");
  try {
    const service = new AbuseRiskService(db, secret);
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
    expect(new AbuseRiskService(db, "another-key-at-least-32-characters-long").device(cookie, { now, secure: true }).setCookie).not.toBeNull();
    expect(service.device(null, { now, secure: false }).setCookie).not.toContain("; Secure");
  } finally { db.close(); }
});

test("combined velocity signals are observational, hashed, isolated from owner input and expire", () => {
  const db = new Database(":memory:");
  try {
    const service = new AbuseRiskService(db, secret);
    for (let i = 0; i < 6; i++) {
      const result = service.recordSignupAttempt({ normalizedEmail: `different-${i}@example.org`, deviceId: "shared-browser", ip: null, now });
      expect(result.risk).toBe("normal");
      expect(result.reason).toBeNull();
      expect("block" in result).toBe(false);
    }
    for (let i = 0; i < 6; i++) {
      expect(service.recordSignupAttempt({ normalizedEmail: null, deviceId: null, ip: "192.0.2.9", now }).risk).toBe("normal");
      expect(service.recordSignupAttempt({ normalizedEmail: "email-only@example.org", deviceId: null, ip: null, now }).risk).toBe("normal");
    }
    let attemptId = "";
    for (let i = 0; i < 3; i++) {
      const result = service.recordSignupAttempt({ normalizedEmail: "reused@example.org", deviceId: "repeated-device", ip: "192.0.2.8", now });
      attemptId = result.attemptId;
      expect(result.risk).toBe(i === 2 ? "review" : "normal");
    }
    const dump = JSON.stringify(db.query("SELECT * FROM auth_abuse_signup_signals").all());
    for (const raw of ["@example.org", "shared-browser", "repeated-device", "192.0.2.8"]) expect(dump).not.toContain(raw);
    expect(db.query("SELECT owner_user_id FROM auth_abuse_signup_signals WHERE id=?").get(attemptId)).toEqual({ owner_user_id: null });
    service.completeSignupAttempt(attemptId, "actual-auth-owner");
    service.completeSignupAttempt(attemptId, "another-owner");
    expect(db.query("SELECT owner_user_id,outcome FROM auth_abuse_signup_signals WHERE id=?").get(attemptId)).toEqual({ owner_user_id: "actual-auth-owner", outcome: "success" });
    const later = service.recordSignupAttempt({ normalizedEmail: "reused@example.org", deviceId: "repeated-device", ip: "192.0.2.8", now: now + 10 * 60 * 1000 });
    expect(later.counts).toEqual({ email: 1, device: 1, ip: 1 });
    service.completeSignupAttempt(later.attemptId, null);
    expect(db.query("SELECT outcome,owner_user_id FROM auth_abuse_signup_signals WHERE id=?").get(later.attemptId)).toEqual({ outcome: "failed", owner_user_id: null });
    service.pruneExpired(now + 24 * 60 * 60 * 1000);
    expect(db.query("SELECT COUNT(*) AS count FROM auth_abuse_signup_signals").get()).toEqual({ count: 1 });
    service.pruneExpired(now + 24 * 60 * 60 * 1000 + 10 * 60 * 1000);
    expect(db.query("SELECT COUNT(*) AS count FROM auth_abuse_signup_signals").get()).toEqual({ count: 0 });
  } finally { db.close(); }
});

test("concurrent processes share atomic counters in the same auth database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ispatla-abuse-"));
  const path = join(dir, "auth.sqlite3");
  try {
    const db = new Database(path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    new AbuseRiskService(db, secret);
    db.close();
    const code = `import {Database} from 'bun:sqlite'; import {AbuseRiskService} from './src/server/abuse-risk.ts'; const db=new Database(process.env.TEST_ABUSE_DB); db.exec('PRAGMA busy_timeout=5000'); const service=new AbuseRiskService(db, process.env.TEST_ABUSE_SECRET); for(let i=0;i<5;i++) service.recordSignupAttempt({normalizedEmail:'same@example.org',deviceId:'same-device',ip:'192.0.2.1',now:${now}}); db.close();`;
    const processes = Array.from({ length: 3 }, () => Bun.spawn([process.execPath, "--eval", code], { env: { ...process.env, TEST_ABUSE_DB: path, TEST_ABUSE_SECRET: secret }, stdout: "pipe", stderr: "pipe" }));
    for (const process of processes) {
      const stderr = await new Response(process.stderr).text();
      expect(await process.exited, stderr).toBe(0);
    }
    const reopened = new Database(path);
    try {
      const final = new AbuseRiskService(reopened, secret).recordSignupAttempt({ normalizedEmail: "same@example.org", deviceId: "same-device", ip: "192.0.2.1", now });
      expect(final.counts).toEqual({ email: 16, device: 16, ip: 16 });
      expect(final.risk).toBe("review");
    } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
