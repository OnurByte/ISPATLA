import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getPostgresDb } from "./postgres";
import { accounts } from "./postgres-schema";
import { getPostgresAccount } from "./postgres-accounts";
import { getPostgresOwnUserProfile } from "./postgres-profile-dashboard";
import { currentOwnerId } from "./owner-context";
import { FxTwitterReader } from "./x-reader";
import { buildVoiceProfile } from "./voice-profile";
import { acceptAccountCategoryInference, runAccountCategoryInference } from "./account-inference";

export function normalizeAccountHandle(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid X handle");
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new Error("Invalid X handle");
  return handle;
}
function owner() { const id = currentOwnerId(); if (!id) throw new Error("authentication required"); return id; }
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function linkPublicAccount(handle: unknown) {
  const ownerUserId = owner();
  const profile = await new FxTwitterReader().fetchProfile({ handle: normalizeAccountHandle(handle) });
  if (!profile.id || !/^\d{1,19}$/.test(profile.id)) throw new Error("X profile identity unavailable");
  const now = Math.floor(Date.now() / 1000);
  const key = `public:${digest(ownerUserId)}:${profile.id}`;
  const existing = (await getPostgresDb().select().from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), eq(accounts.xUserId, profile.id))).limit(1))[0];
  if (existing) await getPostgresDb().update(accounts).set({ handle: profile.handle, displayName: profile.name, updatedAt: now }).where(and(eq(accounts.id, existing.id), eq(accounts.ownerUserId, ownerUserId)));
  const row = existing || (await getPostgresDb().insert(accounts).values({ ownerUserId, accountKey: key, handle: profile.handle,
    xUserId: profile.id, displayName: profile.name, styleProfileJson: JSON.stringify({ bio: profile.bio, avatarUrl: profile.avatarUrl }), updatedAt: now })
    .onConflictDoUpdate({ target: accounts.accountKey, set: { handle: profile.handle, displayName: profile.name, updatedAt: now } }).returning())[0];
  let analysis: { status: string; error?: string };
  try { analysis = await analyzeLinkedAccount(row.id); }
  catch { analysis = { status: "failed", error: "Public account data could not be analyzed. Retry analysis." }; }
  return { account: await getPostgresAccount(ownerUserId, row.id), analysis };
}

export async function analyzeLinkedAccount(accountId: number) {
  const ownerUserId = owner();
  const account = await getPostgresAccount(ownerUserId, accountId);
  if (!account) throw new Error("account not found");
  const reader = new FxTwitterReader();
  const identifier = account.xUserId ? `id:${account.xUserId}` : account.handle;
  const profile = await reader.fetchProfile({ handle: identifier });
  const byId = new Map<string, import("./x-reader").XPost>();
  let cursor = "";
  const cursors = new Set<string>();
  for (let page = 0; page < 4 && byId.size < 100; page++) {
    const batch = await reader.fetchTimeline({ handle: identifier, maxPosts: 100 - byId.size, cursor });
    for (const post of batch.posts) if (account.xUserId ? post.author.id === account.xUserId : post.author.handle === account.handle) byId.set(post.id, post);
    if (!batch.cursor || cursors.has(batch.cursor)) break;
    cursor = batch.cursor; cursors.add(cursor);
  }
  const posts = [...byId.values()];
  const result = await runAccountCategoryInference({ accountId, regenerate: true, publicData: { bio: profile.bio, posts: posts.map((post) => post.text) } });
  if (result.suggestions.length) await acceptAccountCategoryInference({ accountId, categoryIds: result.suggestions.map((item) => item.categoryId), now: Math.floor(Date.now() / 1000) });
  const voice = buildVoiceProfile(posts, { handle: account.handle });
  await getPostgresDb().transaction(async (tx) => {
    const [fresh] = await tx.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId))).for("update");
    if (!fresh) throw new Error("account not found");
    const style = JSON.parse(fresh.styleProfileJson) as Record<string, unknown>;
    if (voice.features.usableSampleSize >= 3 && style.voiceSource !== "manual" && (!style.voice || style.voiceSource === "inferred")) await tx.update(accounts).set({ styleProfileJson: JSON.stringify({ ...style, voice, voiceSource: "inferred", analysisStatus: result.status }), updatedAt: Math.floor(Date.now() / 1000) }).where(eq(accounts.id, accountId));
  });
  return { status: posts.length ? result.status : "insufficient_evidence", result, sampleSize: posts.length };
}

export async function startAccountClaim(accountId: number) {
  const ownerUserId = owner();
  const account = await getPostgresAccount(ownerUserId, accountId);
  if (!account?.enabled || !account.xUserId) throw new Error("account identity unavailable");
  const token = `ispatla-${randomBytes(24).toString("hex")}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 1800;
  await getPostgresDb().execute(sql`INSERT INTO ispatla_app.x_account_claims(account_id,owner_user_id,x_user_id,token_hash,expires_at)
    VALUES(${accountId},${ownerUserId},${account.xUserId},${digest(token)},${expiresAt}) ON CONFLICT(account_id) DO UPDATE
    SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at, consumed_at=NULL WHERE x_account_claims.owner_user_id=${ownerUserId}`);
  return { token, expiresAt };
}

export async function verifyAccountClaim(accountId: number) {
  const ownerUserId = owner();
  const account = await getPostgresAccount(ownerUserId, accountId);
  if (!account?.enabled || !account.xUserId) throw new Error("account identity unavailable");
  const profile = await new FxTwitterReader().fetchProfile({ handle: `id:${account.xUserId}` });
  if (profile.id !== account.xUserId) throw new Error("profile identity mismatch");
  const tokens = profile.bio.match(/\bispatla-[a-f0-9]{48}\b/g) || [];
  const now = Math.floor(Date.now() / 1000);
  await getPostgresOwnUserProfile();
  await getPostgresDb().transaction(async (tx) => {
    const claim = await tx.execute(sql`SELECT c.token_hash FROM ispatla_app.x_account_claims c JOIN ispatla_app.accounts a ON a.id=c.account_id AND a.owner_user_id=c.owner_user_id AND a.x_user_id=c.x_user_id AND a.enabled=true WHERE c.account_id=${accountId} AND c.owner_user_id=${ownerUserId} AND c.x_user_id=${account.xUserId} AND c.expires_at>${now} AND c.consumed_at IS NULL FOR UPDATE OF c,a`);
    if (!claim.rows[0] || !tokens.some((token) => digest(token) === claim.rows[0].token_hash)) throw new Error("verification code missing or expired");
    await tx.execute(sql`INSERT INTO ispatla_app.user_profile_x_identity(owner_user_id,x_user_id) VALUES(${ownerUserId},${account.xUserId}) ON CONFLICT(owner_user_id) DO UPDATE SET x_user_id=EXCLUDED.x_user_id`);
    await tx.update(accounts).set({ ownershipVerifiedAt: now, handle: profile.handle, displayName: profile.name }).where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)));
    await tx.execute(sql`UPDATE ispatla_app.user_profiles SET x_handle=${profile.handle},display_name=${profile.name},bio=${profile.bio.replace(/\bispatla-[a-f0-9]{48}\b/g, "").trim()},updated_at=${now} WHERE owner_user_id=${ownerUserId}`);
    await tx.execute(sql`UPDATE ispatla_app.x_account_claims SET consumed_at=${now} WHERE account_id=${accountId} AND owner_user_id=${ownerUserId}`);
  });
  return { verified: true, handle: profile.handle };
}
