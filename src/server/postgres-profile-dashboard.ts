import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresDb } from "@/server/postgres";
import type { OwnUserProfile } from "@/server/db-types";
import type { DashboardSummary } from "@/server/db-types";

const RESERVED_PROFILE_PATHS = new Set(["api", "app", "u", "h", "compare", "docs", "forgot-password", "leaderboard", "login", "market", "no-viral-guarantee", "open-source", "privacy", "research", "reset-password", "security", "settings", "signup", "terms", "transparency", "robots.txt", "sitemap.xml", "favicon.ico"]);

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
  await getPostgresDb().execute(sql`SELECT 1 FROM ispatla_app.user_profiles WHERE owner_user_id = ${owner}`);
  return {
    dbAvailable: true,
    sourcesConfigured: 0,
    sourcesObserved: 0,
    postsObserved: 0,
    postsLast24h: 0,
    opportunities: 0,
    attemptsPending: 0,
    publishedConfirmed: 0,
    publishBlocked: 0,
    recentPosts: [],
    activity: [],
    lastRun: null,
  };
}
