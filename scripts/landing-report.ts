import { asc } from "drizzle-orm";
import { authUser, drafts, landingEventDaily } from "../src/server/postgres-schema";
import { getPostgresDb } from "../src/server/postgres";
import { firstActionTimeBucket } from "../src/server/landing-measurement";

type Signup = { id: string; createdAt: Date };
type Draft = { ownerUserId: string; createdAt: number };

/** Aggregate retained signups and first saved drafts without returning identities. */
export function aggregateLandingReport(input: { events: unknown[]; users: Signup[]; drafts: Draft[] }) {
  const signups = new Map<string, number>();
  const signupTimes = new Map<string, number>();
  for (const user of input.users) {
    const timestamp = Math.floor(user.createdAt.getTime() / 1000);
    const day = user.createdAt.toISOString().slice(0, 10);
    signups.set(day, (signups.get(day) || 0) + 1);
    signupTimes.set(user.id, timestamp);
  }
  const firstDraftByOwner = new Map<string, number>();
  for (const draft of input.drafts) firstDraftByOwner.set(draft.ownerUserId, Math.min(firstDraftByOwner.get(draft.ownerUserId) ?? Infinity, draft.createdAt));
  const timings = new Map<string, number>();
  for (const [owner, createdAt] of signupTimes) {
    const firstDraft = firstDraftByOwner.get(owner);
    if (firstDraft === undefined || firstDraft < createdAt) continue;
    const bucket = firstActionTimeBucket(firstDraft - createdAt);
    timings.set(bucket, (timings.get(bucket) || 0) + 1);
  }
  const bucketOrder = ["under_1m", "1m_to_10m", "10m_to_1h", "1h_to_24h", "1d_to_7d", "over_7d"];
  return { events: input.events, signups: [...signups].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
    firstSavedDraft: [...timings].sort(([a], [b]) => bucketOrder.indexOf(a) - bucketOrder.indexOf(b)).map(([bucket, count]) => ({ bucket, count })) };
}

export async function landingReport() {
  const db = getPostgresDb();
  const [events, users, savedDrafts] = await Promise.all([
    db.select().from(landingEventDaily).orderBy(asc(landingEventDaily.day), asc(landingEventDaily.event), asc(landingEventDaily.page)),
    db.select({ id: authUser.id, createdAt: authUser.createdAt }).from(authUser),
    db.select({ ownerUserId: drafts.ownerUserId, createdAt: drafts.createdAt }).from(drafts),
  ]);
  return aggregateLandingReport({ events, users, drafts: savedDrafts });
}

if (import.meta.main) {
  const report = await landingReport();
  console.log(JSON.stringify({
    ...report,
    limits: ["Event counts are not unique visitors or causal conversion rates.", "Signup and first-action results describe retained accounts and drafts; deletion changes this snapshot.", "First meaningful action is defined as saving a draft. Timing starts at account creation, not an anonymous landing visit.", "Referrers are coarse categories; no attribution across sessions or devices."],
  }, null, 2));
}
