import { sql } from "drizzle-orm";
import type { PublicUserProfile } from "@/server/db-types";
import { getPostgresDb } from "@/server/postgres";

const RESERVED = new Set(["api", "app", "dashboard", "accounts", "analytics", "categories", "drafts", "evaluation", "onboarding", "opportunities", "queue", "sources", "profile", "u", "h", "compare", "docs", "forgot-password", "leaderboard", "login", "market", "no-viral-guarantee", "open-source", "privacy", "research", "reset-password", "security", "settings", "signup", "terms", "transparency", "robots.txt", "sitemap.xml", "favicon.ico"]);

export function postgresProfilePath(handle: string | null, username: string): string {
  const normalized = handle?.replace(/^@/, "") ?? "";
  return normalized && /^[A-Za-z0-9_]{1,15}$/.test(normalized) && !RESERVED.has(normalized.toLowerCase()) && !/^(en|zh-cn|hi|es|fr|ar|bn|pt-br|ru|id|ur|de|ja|sw|mr|te|tr|ta|vi|ko)$/i.test(normalized)
    ? `/${normalized}` : `/u/${username}`;
}

const enabledProfileOwner = sql`NOT EXISTS (SELECT 1 FROM ispatla_auth.auth_user_status status
  WHERE status.owner_user_id=profile.owner_user_id AND status.status='disabled')`;
const publicProfileEligibility = sql`profile.visibility='public' AND profile.onboarding_completed=TRUE AND ${enabledProfileOwner}`;

type ProfileRow = { username: string; display_name: string; bio: string; x_handle: string | null; avatar_url: string | null };
function map(row: ProfileRow): PublicUserProfile {
  return { username: row.username, displayName: row.display_name, bio: row.bio, xHandle: row.x_handle, avatarUrl: row.avatar_url, profilePath: postgresProfilePath(row.x_handle, row.username) };
}

export async function getPostgresPublicUserProfile(username: string): Promise<PublicUserProfile | null> {
  const result = await getPostgresDb().execute(sql`SELECT username,display_name,bio,x_handle,avatar_url FROM ispatla_app.user_profiles profile
    WHERE profile.username=${username} AND ${publicProfileEligibility} LIMIT 1`);
  const row = result.rows[0] as ProfileRow | undefined;
  return row ? map(row) : null;
}

export async function getPostgresPublicUserProfileByHandle(handle: string): Promise<PublicUserProfile | null> {
  const result = await getPostgresDb().execute(sql`SELECT username,display_name,bio,x_handle,avatar_url FROM ispatla_app.user_profiles profile
    WHERE lower(profile.x_handle)=lower(${handle}) AND ${publicProfileEligibility} LIMIT 1`);
  const row = result.rows[0] as ProfileRow | undefined;
  return row ? map(row) : null;
}

export async function getPostgresProfileAvatarAccess(xUserId: string, ownerUserId?: string): Promise<boolean> {
  const result = await getPostgresDb().execute(sql`SELECT 1 FROM ispatla_app.user_profiles profile
    JOIN ispatla_app.user_profile_x_identity identity ON identity.owner_user_id=profile.owner_user_id
    WHERE identity.x_user_id=${xUserId} AND ${enabledProfileOwner} AND ((profile.visibility='public' AND profile.onboarding_completed=TRUE) OR profile.owner_user_id=${ownerUserId ?? null}) LIMIT 1`);
  return result.rows.length > 0;
}

export async function getPostgresPublicProfileSitemapEntries(limit: number): Promise<Array<{ path: string; updatedAt: number }>> {
  const result = await getPostgresDb().execute(sql`SELECT profile.username,profile.x_handle,profile.updated_at
    FROM ispatla_app.user_profiles profile WHERE ${publicProfileEligibility} ORDER BY profile.username LIMIT ${limit}`);
  return (result.rows as Array<{ username: string; x_handle: string | null; updated_at: string | number }>).map(row => ({
    path: postgresProfilePath(row.x_handle, row.username), updatedAt: Number(row.updated_at),
  }));
}

export async function syncPostgresUserProfileFromX(input: { ownerUserId: string; xUserId: string; handle: string; displayName: string; bio: string; avatarUrl: string | null; protected?: boolean | null; now?: number }): Promise<void> {
  const handle = input.handle.replace(/^@/, "");
  if (!input.ownerUserId || !/^\d{1,32}$/.test(input.xUserId) || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("verified X profile identity is invalid");
  if (input.avatarUrl !== null && input.avatarUrl !== `/api/profile/avatar/${input.xUserId}`) throw new Error("X avatar must use the local profile proxy");
  const db = getPostgresDb();
  const exists = await db.execute(sql`SELECT 1 FROM ispatla_app.user_profiles WHERE owner_user_id=${input.ownerUserId} LIMIT 1`);
  if (!exists.rows.length) throw new Error("profile could not be initialized");
  await db.execute(sql`INSERT INTO ispatla_app.user_profile_x_identity(owner_user_id,x_user_id)
    VALUES(${input.ownerUserId},${input.xUserId}) ON CONFLICT(owner_user_id) DO NOTHING`);
  const identity = await db.execute(sql`SELECT x_user_id FROM ispatla_app.user_profile_x_identity WHERE owner_user_id=${input.ownerUserId} LIMIT 1`);
  if ((identity.rows[0] as { x_user_id: string } | undefined)?.x_user_id !== input.xUserId) return;
  await db.execute(sql`UPDATE ispatla_app.user_profiles SET x_handle=${handle},display_name=${input.displayName.slice(0,80)},bio=${input.bio.slice(0,500)},
    avatar_url=COALESCE(${input.avatarUrl},avatar_url),
    visibility=CASE WHEN ${input.protected ?? null}::boolean IS NULL THEN visibility WHEN ${input.protected ?? false} THEN 'private' ELSE 'public' END,
    updated_at=${input.now ?? Math.floor(Date.now()/1000)} WHERE owner_user_id=${input.ownerUserId}`);
}
