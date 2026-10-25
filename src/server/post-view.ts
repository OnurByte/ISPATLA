import { scoreSourcePost } from "./monitoring";
import { getPostgresSetting } from "./postgres-settings";
import { sql, eq } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { observedPosts } from "./postgres-sources-schema";
import { FxTwitterReader, type XPost } from "./x-reader";
import { internalPostUrl } from "@/lib/post-url";

export type PostView = { post: XPost; observedAt: number; stale: boolean; conversation: XPost[]; conversationUnavailable: boolean; saved: boolean; analysis: { score: number; reason: string } | null; categories: string[]; draftIds: number[] };

export function cachedPost(row: typeof observedPosts.$inferSelect): XPost {
  let snapshot: XPost | null = null;
  try {
    const value = JSON.parse(row.rawJson) as XPost;
    if (value.id === row.externalId && typeof value.text === "string" && value.author && value.metrics && Array.isArray(value.media)) snapshot = value;
  } catch { /* Older observations have no normalized snapshot. */ }
  if (snapshot) return snapshot;
  return { id: row.externalId, url: row.statusUrl, text: row.text, createdAt: row.createdTimestamp,
    author: { handle: row.authorHandle || row.sourceHandle, name: "", bio: "", avatarUrl: "", followers: null, following: null, statuses: null, likes: null, mediaCount: null, verification: "unknown" },
    metrics: { likes: null, replies: null, reposts: null, quotes: null, views: null, pollVotes: null, capturedAt: row.observedAt, quality: "missing" },
    media: [], sensitive: row.sensitive === 1, discovery: { quoteAuthor: "", replyTo: "", mentions: [] } };
}

export async function getPostView(id: string, includeConversation = false): Promise<PostView | null> {
  internalPostUrl(id);
  if (!currentOwnerId()) throw new Error("authentication required");
  const db = getPostgresDb();
  const [row] = await db.select().from(observedPosts).where(eq(observedPosts.externalId, id)).limit(1);
  const reader = new FxTwitterReader();
  const now = Math.floor(Date.now() / 1000);
  let post = row ? cachedPost(row) : null;
  let observedAt = row?.observedAt || now;
  let stale = Boolean(row && now - row.observedAt > 300);
  if (!row || stale || row.rawJson === "{}") {
    try {
      post = await reader.fetchPostMetrics({ externalId: id });
      observedAt = now;
      stale = false;
      const snapshot = scoreSourcePost(row?.sourceHandle || post.author.handle, post, now);
      if (snapshot) await db.insert(observedPosts).values(snapshot).onConflictDoUpdate({ target: observedPosts.externalId, set: { rawJson: snapshot.rawJson, text: snapshot.text, mediaJson: snapshot.mediaJson, observedAt: now, likes: snapshot.likes, replies: snapshot.replies, reposts: snapshot.reposts, quotes: snapshot.quotes, views: snapshot.views, score: snapshot.score, scoreReason: snapshot.scoreReason } });
    } catch { if (!post) return null; stale = true; }
  }
  if (!post) return null;
  let conversation: XPost[] = [];
  let conversationUnavailable = false;
  if (includeConversation) {
    try { conversation = (await reader.fetchConversation({ externalId: id })).posts.filter((item) => item.id !== id).slice(0, 20); }
    catch { conversationUnavailable = true; }
  }
  const context = await db.execute(sql`SELECT d.id FROM ispatla_app.drafts d WHERE d.owner_user_id=${currentOwnerId()!} AND d.external_id=${id} ORDER BY d.updated_at DESC LIMIT 10`);
  const categories = await db.execute(sql`SELECT DISTINCT c.name FROM ispatla_app.account_source_categories sc JOIN ispatla_app.accounts a ON a.id=sc.account_id JOIN ispatla_app.categories c ON c.id=sc.category_id WHERE a.owner_user_id=${currentOwnerId()!} AND sc.enabled=1 AND sc.source_handle=${post.author.handle} AND (c.owner_user_id IS NULL OR c.owner_user_id=${currentOwnerId()!}) LIMIT 12`);
  const [fresh] = await db.select({ score: observedPosts.score, reason: observedPosts.scoreReason }).from(observedPosts).where(eq(observedPosts.externalId, id)).limit(1);
  return { post, observedAt, stale, conversation, conversationUnavailable, analysis: fresh || null, categories: categories.rows.map((row) => String(row.name)), draftIds: context.rows.map((row) => Number(row.id)), saved: (await getPostgresSetting(`saved_post:${id}`, "0")) === "1" };
}
