import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPostgresDb } from "./postgres";

const DEVICE_COOKIE = "ispatla-device";
const DEVICE_TTL = 30 * 24 * 60 * 60 * 1000;
const RETENTION = 24 * 60 * 60 * 1000;
const WINDOW = 10 * 60 * 1000;
export type SignupRisk = { attemptId: string; risk: "normal" | "review"; reason: "combined_signup_velocity" | null; counts: { email: number; device: number; ip: number } };

export class AbuseRiskService {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret) < 32) throw new Error("Abuse signal signing requires a server secret of at least 32 bytes");
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
      if (timingSafeEqual(Buffer.from(this.digest("device-signing", payload)), Buffer.from(match[3])) && issuedAt <= now && now - issuedAt < DEVICE_TTL) return { deviceId: match[2], setCookie: null };
    }
    const deviceId = randomBytes(32).toString("base64url");
    const payload = `v1.${now}.${deviceId}`;
    return { deviceId, setCookie: `${DEVICE_COOKIE}=${payload}.${this.digest("device-signing", payload)}; Path=/; Max-Age=${DEVICE_TTL / 1000}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    await getPostgresDb().execute(sql`DELETE FROM ispatla_auth.auth_abuse_signup_signals WHERE id IN (SELECT id FROM ispatla_auth.auth_abuse_signup_signals WHERE created_at <= ${now - RETENTION} ORDER BY created_at LIMIT 1000)`);
  }

  async recordSignupAttempt(input: { normalizedEmail: string | null; deviceId: string | null; ip: string | null; now?: number }): Promise<SignupRisk> {
    const now = input.now ?? Date.now();
    const email = input.normalizedEmail ? this.digest("email", input.normalizedEmail) : null;
    const device = input.deviceId ? this.digest("device", input.deviceId) : null;
    const ip = input.ip ? this.digest("ip", input.ip) : null;
    const attemptId = randomBytes(16).toString("base64url");
    return getPostgresDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ispatla-auth-signup-risk'))`);
      await tx.execute(sql`DELETE FROM ispatla_auth.auth_abuse_signup_signals WHERE id IN (SELECT id FROM ispatla_auth.auth_abuse_signup_signals WHERE created_at <= ${now - RETENTION} ORDER BY created_at LIMIT 1000)`);
      await tx.execute(sql`INSERT INTO ispatla_auth.auth_abuse_signup_signals(id,email_hash,device_hash,ip_hash,created_at,risk) VALUES (${attemptId},${email},${device},${ip},${now},'normal')`);
      const result = await tx.execute(sql`SELECT
        count(*) FILTER (WHERE email_hash = ${email}) AS email,
        count(*) FILTER (WHERE device_hash = ${device}) AS device,
        count(*) FILTER (WHERE ip_hash = ${ip}) AS ip
        FROM ispatla_auth.auth_abuse_signup_signals WHERE created_at > ${now - WINDOW} AND created_at <= ${now}`);
      const counts = result.rows[0] as SignupRisk["counts"];
      const normalized = { email: Number(counts.email), device: Number(counts.device), ip: Number(counts.ip) };
      const review = (normalized.email >= 3 && (normalized.device >= 3 || normalized.ip >= 3)) || (normalized.device >= 5 && normalized.ip >= 5);
      const risk = review ? "review" : "normal";
      await tx.execute(sql`UPDATE ispatla_auth.auth_abuse_signup_signals SET risk = ${risk} WHERE id = ${attemptId}`);
      return { attemptId, risk, reason: review ? "combined_signup_velocity" : null, counts: normalized };
    });
  }

  async completeSignupAttempt(attemptId: string, ownerUserId: string | null): Promise<void> {
    if (ownerUserId !== null && (!ownerUserId.trim() || ownerUserId.length > 200)) throw new Error("Invalid signup owner");
    await getPostgresDb().execute(sql`UPDATE ispatla_auth.auth_abuse_signup_signals SET owner_user_id = ${ownerUserId}, outcome = ${ownerUserId === null ? "failed" : "success"} WHERE id = ${attemptId} AND outcome = 'pending'`);
  }
}
