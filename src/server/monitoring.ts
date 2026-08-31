import {
  claimMonitorRun,
  finishMonitorRun,
  getCategories,
  getMonitorBudgetUsage,
  getMonitorTargets,
  getSetting,
  getSourceCategoryConfigs,
  getStoredSources,
  recordMonitorObservation,
  recordReaderHealth,
  setSetting,
  updateMonitorLifecycle,
  upsertMonitorTarget,
  upsertPost,
  type MonitorBucket,
  type MonitorTarget,
  type MonitorTier,
} from "./db";
import { aiConfigured, requestAiText } from "./ai";
import { observedPost } from "./pipeline";
import { FxTwitterReader, type XPost } from "./x-reader";

const DAILY_BUDGET = 10_000;
const BUCKET_SHARES: Record<MonitorBucket, number> = {
  proven_alpha: 0.35,
  hot_categories: 0.25,
  discovery: 0.15,
  challengers: 0.10,
  reconciliation: 0.10,
  exploration: 0.05,
};

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

export function seedMonitorTargets(now = Math.floor(Date.now() / 1000)): number {
  let count = 0;
  for (const source of getStoredSources().filter((item) => item.enabled)) {
    upsertMonitorTarget({ kind: "account", key: source.handle, sourceHandle: source.handle, tier: "normal", intervalSeconds: 300, now });
    count += 1;
  }
  for (const category of getCategories().filter((item) => item.enabled)) {
    for (const keyword of category.keywords.slice(0, 10)) {
      const query = keyword.trim();
      if (!query) continue;
      upsertMonitorTarget({ kind: "keyword", key: `${category.slug}:${query}`, categoryId: category.id, query, lifecycle: "active", tier: "normal", intervalSeconds: 300, priority: 0.8, now });
      count += 1;
    }
  }
  return count;
}

function queryLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n|;/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()).filter((line) => line.length >= 3 && line.length <= 160))].slice(0, 5);
}

export async function refreshDiscoveryQueries(now = Math.floor(Date.now() / 1000)): Promise<number> {
  if (!aiConfigured()) return 0;
  const day = istanbulDayKey(now * 1000);
  let created = 0;
  for (const category of getCategories().filter((item) => item.enabled)) {
    const setting = `discovery_queries:${category.id}`;
    if (getSetting(setting, "") === day) continue;
    const text = await requestAiText({
      usageKind: "discovery_query", usageUnits: 15,
      instructions: "Bu kategori için X aramasında kullanılacak en fazla 5 kısa, yüksek kesinlikli sorgu üret. Her satırda yalnız bir sorgu yaz; açıklama, numara veya markdown kullanma. Gizli X sıralama bilgisi bildiğini iddia etme.",
      evidence: JSON.stringify({ name: category.name, description: category.description, keywords: category.keywords, positiveExamples: category.positiveExamples, negativeExamples: category.negativeExamples }),
    });
    for (const query of queryLines(text)) {
      upsertMonitorTarget({ kind: "search_query", key: `${category.slug}:${query}`, categoryId: category.id, query, lifecycle: "challenger", tier: "normal", intervalSeconds: 300, priority: 0.7, now });
      created += 1;
    }
    setSetting(setting, day, now);
  }
  return created;
}

function bucketFor(target: MonitorTarget): MonitorBucket {
  if (target.lifecycle === "challenger") return "challengers";
  if (target.kind === "search_query") return "discovery";
  if (target.kind === "conversation") return "exploration";
  if (target.kind === "keyword") return "hot_categories";
  const configured = getSourceCategoryConfigs().some((item) => item.sourceHandle === target.sourceHandle && item.enabled && item.monitoringTier === "A");
  return configured || target.hits >= 3 ? "proven_alpha" : "exploration";
}

function nextLifecycle(target: MonitorTarget, tier: MonitorTier, uniqueResults: number, hits: number, now: number): MonitorTarget["lifecycle"] {
  const unique = target.uniqueResults + uniqueResults;
  const totalHits = target.hits + hits;
  const yieldRate = unique ? totalHits / unique : 0;
  const falsePositiveRate = target.reviewed ? target.falsePositives / target.reviewed : 0;
  const duplicateRate = target.results ? target.duplicates / target.results : 0;
  if (target.kind === "conversation" && target.lastResultAt > 0 && now - target.lastResultAt >= 6 * 3600) return "retired";
  if (target.lifecycle === "challenger" && unique >= 50 && totalHits >= 3 && yieldRate >= 0.05) return "active";
  if (target.lifecycle === "challenger" && (unique >= 100 && totalHits === 0 || target.reviewed >= 50 && falsePositiveRate >= 0.8 || target.results >= 100 && duplicateRate >= 0.9)) return "retired";
  // ponytail: aggregate cold history, not consecutive runs; add a counter only if retirement churn appears.
  if (target.lifecycle === "active" && tier === "cold" && target.runs >= 2) return "retired";
  return target.lifecycle;
}

async function readTarget(reader: FxTwitterReader, target: MonitorTarget): Promise<XPost[]> {
  if (target.kind === "account") return (await reader.fetchTimeline({ handle: target.sourceHandle || target.key, maxPosts: 20 })).posts;
  if (target.kind === "conversation") return (await reader.fetchConversation({ externalId: target.conversationId || target.key })).posts;
  return (await reader.search({ query: target.query || target.key, count: 20 })).posts;
}

export async function runMonitorTarget(target: MonitorTarget, now = Math.floor(Date.now() / 1000)): Promise<{ status: "success" | "partial" | "skipped"; uniqueResults: number; hits: number }> {
  const bucket = bucketFor(target);
  const runId = claimMonitorRun({ targetId: target.id, dayKey: istanbulDayKey(now * 1000), bucket, now, dailyBudget: DAILY_BUDGET });
  if (!runId) return { status: "skipped", uniqueResults: 0, hits: 0 };
  const reader = new FxTwitterReader();
  try {
    const posts = await readTarget(reader, target);
    recordReaderHealth(reader.health());
    let uniqueResults = 0;
    let hits = 0;
    let duplicates = 0;
    let leadTimeTotal = 0;
    for (const item of posts) {
      const post = observedPost(item.author.handle || target.sourceHandle || "search", item);
      const duplicate = !upsertPost(post, now);
      const hit = post.score >= 70 && !post.sensitive;
      const leadSeconds = Math.max(0, now - post.createdTimestamp);
      if (!recordMonitorObservation({ targetId: target.id, externalId: post.externalId, hit, duplicate, leadSeconds, now })) continue;
      uniqueResults += 1;
      if (duplicate) duplicates += 1;
      if (hit) {
        hits += 1;
        leadTimeTotal += leadSeconds;
        upsertMonitorTarget({ kind: "conversation", key: post.externalId, conversationId: post.externalId, lifecycle: "active", tier: "hot", intervalSeconds: 15, priority: 1.1, now });
      }
    }
    const aggregate = { ...target, results: target.results + posts.length, uniqueResults: target.uniqueResults + uniqueResults, hits: target.hits + hits, duplicates: target.duplicates + duplicates, burstUntil: uniqueResults ? now + 600 : target.burstUntil };
    const cadence = cadenceFor(aggregate, now);
    finishMonitorRun({ runId, targetId: target.id, status: "success", returned: posts.length, uniqueResults, hits, duplicates, leadTimeTotal, tier: cadence.tier, intervalSeconds: cadence.intervalSeconds, burstUntil: aggregate.burstUntil, now });
    const lifecycle = nextLifecycle(target, cadence.tier, uniqueResults, hits, now);
    if (lifecycle !== target.lifecycle) updateMonitorLifecycle(target.id, lifecycle, now);
    return { status: "success", uniqueResults, hits };
  } catch (error) {
    recordReaderHealth(reader.health());
    const cadence = cadenceFor(target, now);
    finishMonitorRun({ runId, targetId: target.id, status: "failed", returned: 0, uniqueResults: 0, hits: 0, duplicates: 0, tier: cadence.tier, intervalSeconds: cadence.intervalSeconds, error: error instanceof Error ? error.message : String(error), now });
    return { status: "partial", uniqueResults: 0, hits: 0 };
  }
}

export async function runDueMonitors(now = Math.floor(Date.now() / 1000), limit = 25): Promise<{ attempted: number; failed: number; skipped: number }> {
  seedMonitorTargets(now);
  try { await refreshDiscoveryQueries(now); } catch { /* AI discovery is optional; deterministic keyword monitors continue. */ }
  const usage = getMonitorBudgetUsage(istanbulDayKey(now * 1000));
  const due = getMonitorTargets({ dueAt: now, limit: 500 })
    .sort((left, right) => usage[bucketFor(left)] / (DAILY_BUDGET * BUCKET_SHARES[bucketFor(left)]) - usage[bucketFor(right)] / (DAILY_BUDGET * BUCKET_SHARES[bucketFor(right)]))
    .slice(0, Math.max(1, Math.min(100, limit)));
  let failed = 0;
  let skipped = 0;
  for (const target of due) {
    const result = await runMonitorTarget(target, now);
    if (result.status === "partial") failed += 1;
    if (result.status === "skipped") skipped += 1;
  }
  return { attempted: due.length, failed, skipped };
}
