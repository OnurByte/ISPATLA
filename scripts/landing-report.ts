import { Database } from "bun:sqlite";
import { join } from "node:path";
import { firstActionTimeBucket } from "../src/server/landing-measurement";

type ReportDatabase = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };

/** Read aggregate evidence from existing records; never add visitor identities. */
export function landingReport(db: ReportDatabase) {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((row) => row.name));
  const events = tables.has("landing_event_daily") ? db.prepare("SELECT * FROM landing_event_daily ORDER BY day,event,page").all() : [];
  if (!tables.has("user")) return { events, signups: [], firstSavedDraft: [] };
  // Better Auth can persist dates as epoch milliseconds or SQLite date strings.
  const createdSeconds = `CASE WHEN typeof(u.createdAt) IN ('integer','real') THEN CASE WHEN u.createdAt>100000000000 THEN u.createdAt/1000 ELSE u.createdAt END ELSE CAST(strftime('%s',u.createdAt) AS INTEGER) END`;
  const signups = db.prepare(`SELECT date((${createdSeconds}),'unixepoch') AS day, COUNT(*) AS count FROM "user" u GROUP BY day ORDER BY day`).all();
  const counts = new Map<string, number>();
  if (tables.has("drafts")) {
    const rows = db.prepare(`SELECT MIN(d.created_at)-(${createdSeconds}) AS elapsed FROM drafts d JOIN "user" u ON u.id=d.owner_user_id GROUP BY u.id HAVING elapsed>=0`).all() as { elapsed: number }[];
    for (const row of rows) {
      const bucket = firstActionTimeBucket(row.elapsed);
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
  }
  return { events, signups, firstSavedDraft: [...counts].map(([bucket, count]) => ({ bucket, count })) };
}

if (import.meta.main) {
  const db = new Database(process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3"), { readonly: true });
  try {
    console.log(JSON.stringify({
      ...landingReport(db),
      limits: ["Event counts are not unique visitors or causal conversion rates.", "Signup and first-action results describe retained accounts and drafts; deletion changes this snapshot.", "First meaningful action is defined as saving a draft. Timing starts at account creation, not an anonymous landing visit.", "Referrers are coarse categories; no attribution across sessions or devices."],
    }, null, 2));
  } finally { db.close(); }
}
