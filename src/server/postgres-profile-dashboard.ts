import { getPostgresMarketInbox } from "./postgres-sources-market";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresDb } from "@/server/postgres";
import type { OwnUserProfile } from "@/server/db-types";
import type { DashboardSummary } from "@/server/db-types";

const RESERVED_PROFILE_PATHS = new Set(["post", "mcp", "api", "app", "u", "h", "compare", "docs", "forgot-password", "leaderboard", "login", "market", "no-viral-guarantee", "open-source", "privacy", "research", "reset-password", "security", "settings", "signup", "terms", "transparency", "robots.txt", "sitemap.xml", "favicon.ico"]);

function profilePath(handle: string | null, username: string): string {
  const normalized = handle?.replace(/^@/, "") ?? "";
  const reserved = /^(en|zh-cn|hi|es|fr|ar|bn|pt-br|ru|id|ur|de|ja|sw|mr|te|tr|ta|vi|ko)$/i.test(normalized);
  return normalized && /^[A-Za-z0-9_]{1,15}$/.test(normalized) && !RESERVED_PROFILE_PATHS.has(normalized.toLowerCase()) && !reserved
    ? `/${normalized}` : `/u/${username}`;
}

type ProfileRow = {
  username: string;
  display_name: string;
  bio: string;
  visibility: "private" | "public";
  created_at: number | string;
  updated_at: number | string;
  x_handle: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
};

function ownerId(): string {
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated profile owner required");
  return owner;
}

function fromRow(row: ProfileRow): OwnUserProfile {
  return {
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    visibility: row.visibility,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    xHandle: row.x_handle,
    avatarUrl: row.avatar_url,
    onboardingCompleted: row.onboarding_completed,
    profilePath: profilePath(row.x_handle, row.username),
  };
}

export async function getPostgresOwnUserProfile(now = Math.floor(Date.now() / 1000)): Promise<OwnUserProfile> {
  const owner = ownerId();
  const db = getPostgresDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = randomBytes(18).toString("base64url");
    if (new Set(username).size < 12) continue;
    await db.execute(sql`INSERT INTO ispatla_app.user_profiles (owner_user_id, username, created_at, updated_at)
      VALUES (${owner}, ${username}, ${now}, ${now}) ON CONFLICT DO NOTHING`);
    const result = await db.execute(sql`SELECT username, display_name, bio, visibility, created_at, updated_at, x_handle, avatar_url, onboarding_completed
      FROM ispatla_app.user_profiles WHERE owner_user_id = ${owner} LIMIT 1`);
    const row = result.rows[0] as ProfileRow | undefined;
    if (row) return fromRow(row);
  }
  throw new Error("profile could not be initialized");
}

export async function savePostgresOwnUserProfile(now = Math.floor(Date.now() / 1000)): Promise<OwnUserProfile> {
  const owner = ownerId();
  await getPostgresOwnUserProfile(now);
  await getPostgresDb().execute(sql`UPDATE ispatla_app.user_profiles SET onboarding_completed = TRUE, updated_at = ${now} WHERE owner_user_id = ${owner}`);
  return getPostgresOwnUserProfile(now);
}

export async function getPostgresDashboardSummary(): Promise<Omit<DashboardSummary, "generatedAt" | "automationEnabled" | "openaiConfigured" | "aiEnabled" | "aiConfigured" | "aiProvider" | "officialPublisherConfigured" | "automationRuntime">> {
  const owner = ownerId();
  const db = getPostgresDb();
  const now = Math.floor(Date.now() / 1000);
  const counts = await db.execute(sql`WITH owned AS (SELECT id FROM ispatla_app.accounts WHERE owner_user_id=${owner}),
    selected AS (SELECT DISTINCT source_handle FROM ispatla_app.account_sources WHERE account_id IN (SELECT id FROM owned) AND enabled=1),
    posts AS (SELECT * FROM ispatla_app.observed_posts WHERE source_handle IN (SELECT source_handle FROM selected)),
    intents AS (SELECT i.* FROM ispatla_app.publication_intents i JOIN ispatla_app.drafts d ON d.id=i.draft_id WHERE d.owner_user_id=${owner})
    SELECT (SELECT count(*) FROM selected) AS sources_configured,
      (SELECT count(DISTINCT source_handle) FROM posts) AS sources_observed,
      (SELECT count(*) FROM posts) AS posts_observed,
      (SELECT count(*) FROM posts WHERE observed_at>=${now - 86400}) AS posts_last_24h,
      (SELECT count(*) FROM posts WHERE observed_at>=${now - 86400} AND score>=70 AND sensitive=0) AS opportunities,
      (SELECT count(*) FROM intents WHERE status IN ('pending_approval','approved','dispatching','pending_reconciliation','reconciliation_required')) AS attempts_pending,
      (SELECT count(*) FROM intents WHERE status='confirmed') AS published_confirmed,
      (SELECT count(*) FROM intents WHERE status='blocked') AS publish_blocked`);
  const row = counts.rows[0] as Record<string, unknown>;
  const numeric = (key: string) => Number(row[key] || 0);
  const [inbox, activity] = await Promise.all([
    getPostgresMarketInbox(owner, { view: "observed", limit: 6, now }),
    db.execute(sql`SELECT to_char(to_timestamp(p.observed_at) AT TIME ZONE 'UTC','YYYY-MM-DD') AS label,
      count(*) AS observed, count(*) FILTER (WHERE p.score>=70 AND p.sensitive=0) AS opportunities
      FROM ispatla_app.observed_posts p WHERE p.observed_at>=${now - 7 * 86400} AND EXISTS
      (SELECT 1 FROM ispatla_app.account_sources s JOIN ispatla_app.accounts a ON a.id=s.account_id WHERE a.owner_user_id=${owner} AND s.enabled=1 AND s.source_handle=p.source_handle)
      GROUP BY label ORDER BY label`),
  ]);
  return { dbAvailable: true, sourcesConfigured: numeric("sources_configured"), sourcesObserved: numeric("sources_observed"),
    postsObserved: numeric("posts_observed"), postsLast24h: numeric("posts_last_24h"), opportunities: numeric("opportunities"),
    attemptsPending: numeric("attempts_pending"), publishedConfirmed: numeric("published_confirmed"), publishBlocked: numeric("publish_blocked"),
    recentPosts: inbox.items.map((item) => ({ ...item, rawJson: "" })),
    activity: activity.rows.map((item) => ({ label: String(item.label), observed: Number(item.observed), opportunities: Number(item.opportunities) })),
    lastRun: null };
}
