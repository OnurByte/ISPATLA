import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEVICE_COOKIE = "ispatla-device";
const DEVICE_TTL = 30 * 24 * 60 * 60 * 1000;
const RETENTION = 24 * 60 * 60 * 1000;
const WINDOW = 10 * 60 * 1000;
type Statement = { run(...params: unknown[]): unknown; get?(...params: unknown[]): unknown };
type SqliteHandle = { exec(sql: string): void; prepare?(sql: string): Statement; query?(sql: string): Statement };
export type SignupRisk = { attemptId: string; risk: "normal" | "review"; reason: "combined_signup_velocity" | null; counts: { email: number; device: number; ip: number } };

export class AbuseRiskService {
  constructor(private readonly db: SqliteHandle, private readonly secret: string) {
    if (Buffer.byteLength(secret) < 32) throw new Error("Abuse signal signing requires a server secret of at least 32 bytes");
    db.exec(`CREATE TABLE IF NOT EXISTS auth_abuse_signup_signals (
      id TEXT PRIMARY KEY, owner_user_id TEXT, email_hash TEXT, device_hash TEXT, ip_hash TEXT,
      created_at INTEGER NOT NULL, outcome TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','failed','success')),
      risk TEXT NOT NULL CHECK(risk IN ('normal','review'))
    );
    CREATE INDEX IF NOT EXISTS auth_abuse_signup_expiry_idx ON auth_abuse_signup_signals(created_at);
    CREATE INDEX IF NOT EXISTS auth_abuse_signup_email_idx ON auth_abuse_signup_signals(email_hash,created_at);
    CREATE INDEX IF NOT EXISTS auth_abuse_signup_device_idx ON auth_abuse_signup_signals(device_hash,created_at);
    CREATE INDEX IF NOT EXISTS auth_abuse_signup_ip_idx ON auth_abuse_signup_signals(ip_hash,created_at);`);
  }

  private statement(sql: string): Statement {
    const statement = this.db.prepare?.(sql) || this.db.query?.(sql);
    if (!statement) throw new Error("SQLite prepared statements are unavailable");
    return statement;
  }

  private digest(kind: string, value: string): string {
    return createHmac("sha256", this.secret).update(`ispatla-abuse:${kind}:v1\0${value}`).digest("base64url");
  }

  device(cookieHeader: string | null, { now = Date.now(), secure }: { now?: number; secure: boolean }): { deviceId: string; setCookie: string | null } {
    const values = (cookieHeader && cookieHeader.length <= 16_384 ? cookieHeader : "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${DEVICE_COOKIE}=`));
    const token = values.length === 1 ? values[0].slice(DEVICE_COOKIE.length + 1) : "";
    const match = token.length <= 160 ? /^v1\.(\d{13})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token) : null;
    if (match) {
      const issuedAt = Number(match[1]);
      const payload = `v1.${match[1]}.${match[2]}`;
      const expected = Buffer.from(this.digest("device-signing", payload));
      const supplied = Buffer.from(match[3]);
      if (timingSafeEqual(expected, supplied) && issuedAt <= now && now - issuedAt < DEVICE_TTL) return { deviceId: match[2], setCookie: null };
    }
    const deviceId = randomBytes(32).toString("base64url");
    const payload = `v1.${now}.${deviceId}`;
    return { deviceId, setCookie: `${DEVICE_COOKIE}=${payload}.${this.digest("device-signing", payload)}; Path=/; Max-Age=${DEVICE_TTL / 1000}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
  }

  pruneExpired(now = Date.now()): void {
    this.statement("DELETE FROM auth_abuse_signup_signals WHERE id IN (SELECT id FROM auth_abuse_signup_signals WHERE created_at <= ? ORDER BY created_at LIMIT 1000)").run(now - RETENTION);
  }

  recordSignupAttempt(input: { normalizedEmail: string | null; deviceId: string | null; ip: string | null; now?: number }): SignupRisk {
    const now = input.now ?? Date.now();
    const email = input.normalizedEmail ? this.digest("email", input.normalizedEmail) : null;
    const device = input.deviceId ? this.digest("device", input.deviceId) : null;
    const ip = input.ip ? this.digest("ip", input.ip) : null;
    const attemptId = randomBytes(16).toString("base64url");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.pruneExpired(now);
      this.statement("INSERT INTO auth_abuse_signup_signals(id,email_hash,device_hash,ip_hash,created_at,risk) VALUES (?,?,?,?,?,'normal')").run(attemptId, email, device, ip, now);
      const statement = this.statement(`SELECT
        COALESCE(SUM(email_hash = ?),0) AS email,
        COALESCE(SUM(device_hash = ?),0) AS device,
        COALESCE(SUM(ip_hash = ?),0) AS ip
        FROM auth_abuse_signup_signals WHERE created_at > ? AND created_at <= ?`);
      if (!statement.get) throw new Error("SQLite row reads are unavailable");
      const counts = statement.get(email, device, ip, now - WINDOW, now) as SignupRisk["counts"];
      const review = (counts.email >= 3 && (counts.device >= 3 || counts.ip >= 3)) || (counts.device >= 5 && counts.ip >= 5);
      const risk = review ? "review" : "normal";
      this.statement("UPDATE auth_abuse_signup_signals SET risk = ? WHERE id = ?").run(risk, attemptId);
      this.db.exec("COMMIT");
      return { attemptId, risk, reason: review ? "combined_signup_velocity" : null, counts };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // Only the auth handler may pass a user id read from a successful Better Auth response.
  completeSignupAttempt(attemptId: string, ownerUserId: string | null): void {
    if (ownerUserId !== null && (!ownerUserId.trim() || ownerUserId.length > 200)) throw new Error("Invalid signup owner");
    this.statement("UPDATE auth_abuse_signup_signals SET owner_user_id = ?, outcome = ? WHERE id = ? AND outcome = 'pending'").run(ownerUserId, ownerUserId === null ? "failed" : "success", attemptId);
  }
}
