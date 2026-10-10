import { sql } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";

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

export async function recordLandingEvent(event: string, page: string, nowSeconds = Math.floor(Date.now() / 1000), source: LandingTrafficSource = "direct"): Promise<void> {
  const day = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
  const db = getPostgresDb();
  await db.execute(sql`DELETE FROM ispatla_app.landing_event_daily WHERE day < ${new Date((nowSeconds - 400 * 86400) * 1000).toISOString().slice(0, 10)}`);
  await db.execute(sql`INSERT INTO ispatla_app.landing_event_daily(day,event,page,bucket,source,count)
    VALUES(${day},${event},${page},'',${source},1)
    ON CONFLICT(day,event,page,bucket,source) DO UPDATE SET count=LEAST(ispatla_app.landing_event_daily.count+1,10000000)
    WHERE ispatla_app.landing_event_daily.count<10000000`);
}
