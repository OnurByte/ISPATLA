export type LandingMeasurementDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[]; run(...values: unknown[]): unknown };
};

import type { LandingTrafficSource } from "@/lib/landing-measurement";
export type LandingTimeBucket = "under_1m" | "1m_to_10m" | "10m_to_1h" | "1h_to_24h" | "1d_to_7d" | "over_7d";

export function firstActionTimeBucket(seconds: number): LandingTimeBucket {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("elapsed time must be a non-negative number");
  if (seconds < 60) return "under_1m";
  if (seconds < 600) return "1m_to_10m";
  if (seconds < 3600) return "10m_to_1h";
  if (seconds < 86400) return "1h_to_24h";
  if (seconds < 604800) return "1d_to_7d";
  return "over_7d";
}

function ensureDailyTable(db: LandingMeasurementDatabase): void {
  const columns = (db.prepare("PRAGMA table_info(landing_event_daily)").all() as Array<{ name: string }>).map(({ name }) => name);
  if (!columns.length) {
    db.exec("CREATE TABLE landing_event_daily (day TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL, bucket TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'direct', count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,event,page,bucket,source));");
    return;
  }
  if (["bucket", "source"].every((column) => columns.includes(column))) return;

  const bucket = columns.includes("bucket") ? "bucket" : "''";
  const source = columns.includes("source") ? "source" : "'direct'";
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(`CREATE TABLE landing_event_daily_v2 (day TEXT NOT NULL, event TEXT NOT NULL, page TEXT NOT NULL, bucket TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'direct', count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,event,page,bucket,source));
      INSERT INTO landing_event_daily_v2(day,event,page,bucket,source,count) SELECT day,event,page,${bucket},${source},count FROM landing_event_daily;
      ALTER TABLE landing_event_daily RENAME TO landing_event_daily_legacy;
      ALTER TABLE landing_event_daily_v2 RENAME TO landing_event_daily;
      COMMIT;`);
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function recordLandingEvent(db: LandingMeasurementDatabase, event: string, page: string, nowSeconds = Math.floor(Date.now() / 1000), source: LandingTrafficSource = "direct"): void {
  ensureDailyTable(db);
  const day = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
  db.prepare("DELETE FROM landing_event_daily WHERE day < ?").run(new Date((nowSeconds - 400 * 86400) * 1000).toISOString().slice(0, 10));
  db.prepare("INSERT INTO landing_event_daily(day,event,page,bucket,source,count) VALUES(?,?,?,'',?,1) ON CONFLICT(day,event,page,bucket,source) DO UPDATE SET count=MIN(count+1,10000000) WHERE count<10000000").run(day, event, page, source);
}
