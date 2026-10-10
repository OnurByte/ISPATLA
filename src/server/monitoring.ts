import { and, eq, inArray, sql } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { getPostgresAccounts } from "./postgres-accounts";
import { isPostgresOwnerEnabled } from "./postgres-publishing";
import { getPostgresAccountSources } from "./postgres-sources-market";
import { accountSourceCategories, observedPosts } from "./postgres-sources-schema";
import { clusterKey, scorePost } from "./scoring";
import { safeStatusUrl } from "./security";
import { FxTwitterReader, type XPost, type XReader } from "./x-reader";
import type { MonitorTarget, MonitorTier, SourceConfig } from "./db-types";

const MAX_SOURCE_READS = 10;
const MAX_POSTS_PER_SOURCE = 50;

export type SourceScanResult = {
  status: "ok" | "partial" | "skipped";
  sourceCount: number;
  postsSeen: number;
  postsNew: number;
  postsScored: number;
  errors: string[];
};

type ScoredObservedPost = typeof observedPosts.$inferInsert;

function safeMetric(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function scoreSourcePost(sourceHandle: string, value: XPost, now: number): ScoredObservedPost | null {
  if (!/^[a-z0-9_]{1,15}$/iu.test(sourceHandle) || !value || typeof value !== "object"
    || typeof value.id !== "string" || !/^\d{1,19}$/.test(value.id) || typeof value.text !== "string" || !value.text.trim()) return null;
  const authorHandle = String(value.author?.handle || sourceHandle).replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/u.test(authorHandle) || !Number.isSafeInteger(value.createdAt) || value.createdAt < 1) return null;
  const likes = safeMetric(value.metrics?.likes), replies = safeMetric(value.metrics?.replies), reposts = safeMetric(value.metrics?.reposts);
  const quotes = safeMetric(value.metrics?.quotes), views = safeMetric(value.metrics?.views), followers = safeMetric(value.author?.followers);
  const mediaCount = Array.isArray(value.media) ? Math.min(100, value.media.length) : 0;
  const sensitive = value.sensitive === true;
  const text = value.text.slice(0, 20_000);
  const score = scorePost({ likes, replies, reposts, quotes, views, followers, createdTimestamp: value.createdAt, mediaCount, sensitive, now });
  const verification = ["blue", "organization", "government", "not_verified", "unknown"].includes(value.author?.verification)
    ? value.author.verification : "unknown";
  const media = Array.isArray(value.media) ? value.media.slice(0, 100) : [];
  return {
    externalId: value.id,
    sourceHandle: sourceHandle.toLowerCase(),
    authorHandle,
    statusUrl: safeStatusUrl(value.url, authorHandle, value.id),
    text,
    createdTimestamp: value.createdAt,
    likes, replies, reposts, quotes, views, authorFollowers: followers,
    authorBlueCheckStatus: verification,
    authorVerificationStatus: verification,
    mediaCount,
    mediaJson: JSON.stringify(media),
    rawJson: "{}",
    score: score.score,
    scoreReason: score.reason,
    sensitive: sensitive ? 1 : 0,
    clusterKey: clusterKey(text),
    observedAt: now,
  };
}

/** Scans only this owner's enabled account sources; it never creates drafts or publication intents. */
export async function scanPostgresSources(input: { reader?: XReader; now?: number } = {}): Promise<SourceScanResult> {
  const ownerUserId = currentOwnerId();
  if (!ownerUserId) throw new Error("Oturum gerekli");
  const result: SourceScanResult = { status: "skipped", sourceCount: 0, postsSeen: 0, postsNew: 0, postsScored: 0, errors: [] };
  if (!(await isPostgresOwnerEnabled(ownerUserId))) return result;
  const accounts = (await getPostgresAccounts(ownerUserId)).filter((account) => account.enabled);
  const byHandle = new Map<string, { source: SourceConfig; accountIds: number[] }>();
  for (const account of accounts) {
    for (const source of await getPostgresAccountSources(ownerUserId, account.id)) {
      if (!source.enabled || source.profile.status === "candidate" || !/^[a-z0-9_]{1,15}$/iu.test(source.handle)) continue;
      const handle = source.handle.replace(/^@/, "").toLowerCase();
      const normalized = { ...source, handle };
      const current = byHandle.get(handle);
      if (current) {
        current.source.maxPosts = Math.max(current.source.maxPosts, source.maxPosts);
        current.accountIds.push(account.id);
      } else byHandle.set(handle, { source: normalized, accountIds: [account.id] });
    }
  }
  // shortcut: only the first ten sources run per request, add a persisted owner cursor before enabling multi-source scheduled scans.
  const sources = [...byHandle.entries()].slice(0, MAX_SOURCE_READS);
  if (byHandle.size > sources.length) result.errors.push(`source limit reached (${MAX_SOURCE_READS})`);
  if (!sources.length) return { ...result, status: result.errors.length ? "partial" : "skipped" };
  const reader = input.reader || new FxTwitterReader();
  const now = input.now ?? Math.floor(Date.now() / 1000);
  result.status = "ok";
  for (let offset = 0; offset < sources.length; offset += 5) {
    await Promise.all(sources.slice(offset, offset + 5).map(async ([handle, entry]) => {
      result.sourceCount++;
      try {
        const requested = Number.isInteger(entry.source.maxPosts) ? entry.source.maxPosts : 20;
        const batch = await reader.fetchTimeline({ handle, maxPosts: Math.max(1, Math.min(MAX_POSTS_PER_SOURCE, requested)) });
        const uniquePosts = new Map<string, ScoredObservedPost>();
        for (const post of Array.isArray(batch.posts) ? batch.posts : []) {
          const scored = scoreSourcePost(handle, post, now);
          if (scored && !uniquePosts.has(scored.externalId)) uniquePosts.set(scored.externalId, scored);
        }
        const posts = [...uniquePosts.values()];
        result.postsSeen += Array.isArray(batch.posts) ? batch.posts.length : 0;
        result.postsScored += posts.length;
        if (!posts.length) return;
        let newCount = 0;
        await getPostgresDb().transaction(async (tx) => {
          const existing = await tx.select({ externalId: observedPosts.externalId }).from(observedPosts)
            .where(inArray(observedPosts.externalId, posts.map((post) => post.externalId)));
          const existingIds = new Set(existing.map((post) => post.externalId));
          newCount = posts.filter((post) => !existingIds.has(post.externalId)).length;
          await tx.insert(observedPosts).values(posts).onConflictDoUpdate({ target: observedPosts.externalId, set: {
            sourceHandle: sql`excluded.source_handle`, authorHandle: sql`excluded.author_handle`, statusUrl: sql`excluded.status_url`, text: sql`excluded.text`,
            createdTimestamp: sql`excluded.created_timestamp`, likes: sql`excluded.likes`, replies: sql`excluded.replies`, reposts: sql`excluded.reposts`,
            quotes: sql`excluded.quotes`, views: sql`excluded.views`, authorFollowers: sql`excluded.author_followers`,
            authorBlueCheckStatus: sql`excluded.author_blue_check_status`, authorVerificationStatus: sql`excluded.author_verification_status`,
            mediaCount: sql`excluded.media_count`, mediaJson: sql`excluded.media_json`, rawJson: sql`excluded.raw_json`,
            score: sql`excluded.score`, scoreReason: sql`excluded.score_reason`, sensitive: sql`excluded.sensitive`,
            clusterKey: sql`excluded.cluster_key`, observedAt: sql`excluded.observed_at`,
          } });
          await tx.update(accountSourceCategories).set({ lastEvidenceAt: sql`GREATEST(${accountSourceCategories.lastEvidenceAt}, ${now})` })
            .where(and(inArray(accountSourceCategories.accountId, [...new Set(entry.accountIds)]), eq(accountSourceCategories.sourceHandle, handle), eq(accountSourceCategories.enabled, 1)));
        });
        result.postsNew += newCount;
      } catch (error) {
        result.errors.push(`@${handle}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }
  if (result.errors.length) result.status = "partial";
  return result;
}

export function istanbulDayKey(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function cadenceFor(target: Pick<MonitorTarget, "kind" | "hits" | "uniqueResults" | "results" | "reviewed" | "falsePositives" | "duplicates" | "burstUntil">, now: number): { tier: MonitorTier; intervalSeconds: number } {
  if (target.burstUntil > now) return { tier: "hot", intervalSeconds: 15 };
  const hitYield = target.uniqueResults ? target.hits / target.uniqueResults : 0;
  const duplicateRate = target.results ? target.duplicates / target.results : 0;
  const falsePositiveRate = target.reviewed ? target.falsePositives / target.reviewed : 0;
  if (target.kind !== "account" && ((target.reviewed >= 50 && falsePositiveRate >= 0.8) || (target.results >= 100 && duplicateRate >= 0.9))) return { tier: "cold", intervalSeconds: 900 };
  if (target.hits >= 3 && hitYield >= 0.1) return { tier: "hot", intervalSeconds: 15 };
  if (target.hits >= 1 || hitYield >= 0.03) return { tier: "warm", intervalSeconds: 60 };
  if (target.uniqueResults >= 100 && target.hits === 0) return { tier: "cold", intervalSeconds: 900 };
  return { tier: "normal", intervalSeconds: 300 };
}

// Keep the worker closed until owner-scoped monitor targets are ported.
export function seedMonitorTargets(): number { return 0; }
export async function refreshDiscoveryQueries(): Promise<number> { return 0; }
export async function runMonitorTarget(_target: MonitorTarget): Promise<{ status: "skipped"; uniqueResults: number; hits: number }> {
  return { status: "skipped", uniqueResults: 0, hits: 0 };
}
export async function runDueMonitors(_now?: number, _limit?: number): Promise<{ attempted: number; failed: number; skipped: number }> {
  return { attempted: 0, failed: 0, skipped: 1 };
}
