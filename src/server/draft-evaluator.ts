import { aiConfigured, requestDraftSemanticFeatures, type AiProvider, type DraftSemanticFeatures } from "./ai";
import { sql } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { getPostgresAccount } from "./postgres-accounts";
import { getPostgresDraft } from "./postgres-drafts";
import type { Account, DraftEvaluation } from "./db-types";
import { listEvaluationOutcomes, listEvaluationPredictions } from "./evaluation-store";

export type DraftMediaType = "none" | "photo" | "video" | "media";

async function recordPostgresDraftEvaluation(input: Omit<DraftEvaluation, "id" | "createdAt" | "updatedAt"> & { draftId: number; now: number }): Promise<DraftEvaluation> {
  const owner = currentOwnerId();
  if (!owner) throw new Error("draft evaluation requires an owner context");
  const draft = await getPostgresDraft(input.draftId);
  if (!draft || draft.accountId !== input.accountId) throw new Error("draft evaluation draft not found for owner");
  if (input.accountId !== null && !(await getPostgresAccount(owner, input.accountId))) throw new Error("draft evaluation account not found for owner");
  const baseline = input.baseline;
  const result = await getPostgresDb().execute(sql`INSERT INTO ispatla_app.draft_evaluations (
    draft_id,account_id,category_slug,mode,score,confidence,predicted_residual,baseline_scope,baseline_samples,
    baseline_views,baseline_likes,baseline_replies,baseline_reposts,baseline_quotes,baseline_engagement_rate,
    predicted_views,predicted_replies,predicted_reposts,predicted_quotes,features_json,semantic_json,helped_json,hurt_json,created_at,updated_at
  ) VALUES (${input.draftId},${input.accountId},${input.categorySlug},${input.mode},${input.score},${input.confidence},${input.predictedResidual},
    ${baseline.scope},${baseline.samples},${baseline.medianViews},${baseline.medianLikes},${baseline.medianReplies},${baseline.medianReposts},${baseline.medianQuotes},${baseline.medianEngagementRate},
    ${input.predictedViews},${input.predictedReplies},${input.predictedReposts},${input.predictedQuotes},${JSON.stringify(input.features)},${JSON.stringify(input.semantic)},
    ${JSON.stringify(input.helped.slice(0,8))},${JSON.stringify(input.hurt.slice(0,8))},${input.now},${input.now})
  ON CONFLICT(draft_id) DO UPDATE SET account_id=excluded.account_id,category_slug=excluded.category_slug,mode=excluded.mode,
    score=excluded.score,confidence=excluded.confidence,predicted_residual=excluded.predicted_residual,baseline_scope=excluded.baseline_scope,
    baseline_samples=excluded.baseline_samples,baseline_views=excluded.baseline_views,baseline_likes=excluded.baseline_likes,
    baseline_replies=excluded.baseline_replies,baseline_reposts=excluded.baseline_reposts,baseline_quotes=excluded.baseline_quotes,
    baseline_engagement_rate=excluded.baseline_engagement_rate,predicted_views=excluded.predicted_views,predicted_replies=excluded.predicted_replies,
    predicted_reposts=excluded.predicted_reposts,predicted_quotes=excluded.predicted_quotes,features_json=excluded.features_json,
    semantic_json=excluded.semantic_json,helped_json=excluded.helped_json,hurt_json=excluded.hurt_json,updated_at=excluded.updated_at
  RETURNING id`);
  const id = Number((result.rows[0] as { id: number }).id);
  return { ...input, id, createdAt: input.now, updatedAt: input.now };
}

async function draftOutcomeBaseline(accountId: number, categorySlug: string, format: string) {
  const empty = { scope: "none" as const, samples: 0, medianViews: null, medianLikes: null, medianReplies: null, medianReposts: null, medianQuotes: null, medianEngagementRate: null };
  try {
    const posts = new Map<string, { capturedAt: number; views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null }>();
    for (const prediction of await listEvaluationPredictions(String(accountId), undefined, 500)) {
      if (prediction.category !== categorySlug || prediction.format !== format || prediction.action !== format
        || prediction.features.decision !== "eligible") continue;
      for (const outcome of await listEvaluationOutcomes(prediction.id)) {
        const provenance = outcome.provenanceRef.match(new RegExp(`^official_x:${accountId}:(\\d{1,19}):published_at=(\\d{1,12})$`, "u"));
        if (outcome.source !== "official_x_api" || !provenance) continue;
        const publishedAt = Number(provenance[2]);
        if (!Number.isSafeInteger(publishedAt) || publishedAt < prediction.createdAt || outcome.observedAt < publishedAt
          || outcome.capturedAt < publishedAt + 14 * 86400) continue;
        const key = provenance[1], previous = posts.get(key);
        if (!previous || outcome.capturedAt > previous.capturedAt) posts.set(key, { capturedAt: outcome.capturedAt, ...outcome.metrics });
      }
    }
    const samples = [...posts.values()].filter(row => [row.views,row.likes,row.replies,row.reposts,row.quotes].some(value => value !== null));
    if (!samples.length) return empty;
    const metric = (key: "views" | "likes" | "replies" | "reposts" | "quotes") => median(samples.map(row => row[key]).filter((value): value is number => value !== null));
    const rates = samples.flatMap(row => row.views !== null && row.views > 0 && row.likes !== null && row.replies !== null && row.reposts !== null && row.quotes !== null
      ? [(row.likes + row.replies + row.reposts + row.quotes) / row.views] : []);
    return { scope: "account_category_format" as const, samples: samples.length, medianViews: metric("views"), medianLikes: metric("likes"),
      medianReplies: metric("replies"), medianReposts: metric("reposts"), medianQuotes: metric("quotes"), medianEngagementRate: median(rates) };
  } catch {
    return empty;
  }
}

export async function formatHistoryEvidence(accountId: number, categorySlug: string, formats: string[]) {
  const result: Record<string, { samples: number | null; engagementRate: number | null }> = Object.fromEntries(formats.map((format) => [format, { samples: null, engagementRate: null }]));
  try {
    const predictions = (await listEvaluationPredictions(String(accountId), undefined, 500))
      .filter((prediction) => prediction.accountId === String(accountId) && prediction.category === categorySlug
        && prediction.action === prediction.format && prediction.features.decision === "eligible" && formats.includes(prediction.format));
    const byPublication = new Map<string, { format: string; engagementRate: number; capturedAt: number }>();
    for (const prediction of predictions) {
      for (const outcome of await listEvaluationOutcomes(prediction.id)) {
        if (outcome.source !== "official_x_api") continue;
        const provenance = outcome.provenanceRef.match(new RegExp(`^official_x:${accountId}:(\\d{1,19}):published_at=(\\d{1,12})$`, "u"));
        if (!provenance) continue;
        const publishedAt = Number(provenance[2]);
        if (!Number.isSafeInteger(publishedAt) || publishedAt < prediction.createdAt
          || outcome.observedAt < publishedAt || outcome.capturedAt < publishedAt + 14 * 86400) continue;
        const { views, likes, replies, reposts, quotes } = outcome.metrics;
        if (views === null || views <= 0 || [likes, replies, reposts, quotes].some((value) => value === null)) continue;
        const engagementRate = (likes! + replies! + reposts! + quotes!) / views;
        if (!Number.isFinite(engagementRate) || engagementRate < 0) continue;
        const key = `${provenance[1]}\0${prediction.category}\0${prediction.format}`;
        const previous = byPublication.get(key);
        if (!previous || outcome.capturedAt > previous.capturedAt) {
          byPublication.set(key, { format: prediction.format, engagementRate, capturedAt: outcome.capturedAt });
        }
      }
    }
    for (const format of formats) {
      const rates = [...byPublication.values()].filter((sample) => sample.format === format).map((sample) => sample.engagementRate);
      result[format] = { samples: rates.length, engagementRate: median(rates) };
    }
  } catch {
    // An unreadable evaluation history is unavailable evidence, never a zero-score history.
  }
  return result;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type DraftDeterministicFeatures = {
  charCount: number;
  wordCount: number;
  lineCount: number;
  urlCount: number;
  mentionCount: number;
  hashtagCount: number;
  numberTokenCount: number;
  question: boolean;
  repeatedPunctuation: boolean;
  uppercaseRatio: number;
  openingLength: number;
  mediaType: DraftMediaType;
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function uniqueReasons(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
}

export function extractDraftFeatures(text: string, mediaType: DraftMediaType = "none"): DraftDeterministicFeatures {
  const clean = text.trim();
  const words = clean.split(/\s+/u).filter(Boolean);
  const letters = [...clean].filter((character) => /\p{L}/u.test(character));
  const uppercase = letters.filter((character) => {
    const upper = character.toLocaleUpperCase("tr-TR");
    const lower = character.toLocaleLowerCase("tr-TR");
    return upper !== lower && character === upper;
  });
  const opening = clean.split(/[\n.!?]/u)[0]?.trim() || clean;
  return {
    charCount: clean.length,
    wordCount: words.length,
    lineCount: clean ? clean.split(/\n/u).length : 0,
    urlCount: (clean.match(/https?:\/\/\S+/giu) || []).length,
    mentionCount: (clean.match(/(^|\s)@[\p{L}\p{N}_]+/gu) || []).length,
    hashtagCount: (clean.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length,
    numberTokenCount: words.filter((word) => /\d/u.test(word)).length,
    question: /\?/u.test(clean),
    repeatedPunctuation: /([!?.,])\1{2,}/u.test(clean),
    uppercaseRatio: letters.length ? uppercase.length / letters.length : 0,
    openingLength: opening.length,
    mediaType,
  };
}

export function scoreDraftFeatures(
  features: DraftDeterministicFeatures,
  semantic: DraftSemanticFeatures | null,
): { score: number; helped: string[]; hurt: string[] } {
  let deterministic = 50;
  const helped: string[] = [];
  const hurt: string[] = [];

  if (features.charCount >= 60 && features.charCount <= 230) {
    deterministic += 6;
    helped.push("metin uzunluğu X için dengeli");
  } else if (features.charCount < 35) {
    deterministic -= 10;
    hurt.push("taslak çok kısa");
  } else if (features.charCount > 260) {
    deterministic -= 6;
    hurt.push("karakter sınırına fazla yakın");
  }
  if (features.numberTokenCount >= 1 && features.numberTokenCount <= 4) {
    deterministic += 5;
    helped.push("somut sayı veya ölçü içeriyor");
  }
  if (features.mediaType !== "none") {
    deterministic += 4;
    helped.push("medya eşlik ediyor");
  }
  if (features.urlCount > 0) {
    deterministic -= Math.min(10, features.urlCount * 5);
    hurt.push("dış bağlantı içeriyor");
  }
  if (features.question) deterministic += 2;
  if (features.repeatedPunctuation) {
    deterministic -= 7;
    hurt.push("tekrarlanan noktalama bait görünümü yaratıyor");
  }
  if (features.hashtagCount > 2) {
    deterministic -= 6;
    hurt.push("fazla hashtag içeriyor");
  }
  if (features.mentionCount > 3) {
    deterministic -= 5;
    hurt.push("fazla mention içeriyor");
  }
  if (features.uppercaseRatio > 0.25 && features.wordCount > 4) {
    deterministic -= 6;
    hurt.push("yüksek büyük harf oranı");
  }
  if (features.openingLength > 180) {
    deterministic -= 4;
    hurt.push("ilk cümle uzun");
  }

  deterministic = clamp(deterministic);
  if (!semantic) return { score: Math.round(deterministic), helped: uniqueReasons(helped), hurt: uniqueReasons(hurt) };

  const semanticScore = clamp(
    semantic.hookStrength * 0.18 +
    semantic.specificity * 0.15 +
    semantic.clarity * 0.12 +
    semantic.novelty * 0.10 +
    semantic.replyPotential * 0.13 +
    semantic.repostPotential * 0.16 +
    semantic.accountFit * 0.16 -
    semantic.baitRisk * 0.15,
  );
  const score = clamp(deterministic * 0.35 + semanticScore * 0.65);
  return {
    score: Math.round(score),
    helped: uniqueReasons([...helped, ...semantic.helped]),
    hurt: uniqueReasons([...hurt, ...semantic.hurt]),
  };
}

function predictedMetric(value: number | null, residual: number | null): number | null {
  if (value === null || residual === null) return null;
  return Math.max(0, Math.round(value * residual));
}

export async function evaluateDraft(input: {
  draftId: number;
  text: string;
  account: Account;
  categorySlug?: string;
  format: string;
  mediaType?: DraftMediaType;
  sourceText?: string;
  aiRoute?: { provider?: AiProvider; model?: string };
  now?: number;
}): Promise<DraftEvaluation> {
  const now = input.now || Math.floor(Date.now() / 1000);
  const categorySlug = String(input.categorySlug || "").trim().toLocaleLowerCase("tr-TR");
  const features = extractDraftFeatures(input.text, input.mediaType || "none");
  const baseline = await draftOutcomeBaseline(input.account.id, categorySlug, input.format);

  let semantic: DraftSemanticFeatures | null = null;
  let semanticMetadata: Record<string, unknown> = {};
  if (await aiConfigured()) {
    try {
      semantic = await requestDraftSemanticFeatures({
        text: input.text,
        accountHandle: input.account.handle,
        accountContext: {
          niche: input.account.styleProfile.niche || "",
          tone: input.account.styleProfile.tone || "",
          opening: input.account.styleProfile.opening || "",
          formatRule: input.account.styleProfile.formatRule || "",
          categories: input.account.styleProfile.categories || [],
        },
        category: categorySlug,
        format: input.format,
        sourceText: input.sourceText,
        provider: input.aiRoute?.provider,
        model: input.aiRoute?.model,
      });
      semanticMetadata = semantic;
    } catch (error) {
      semanticMetadata = {
        unavailable: true,
        reason: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      };
    }
  } else {
    semanticMetadata = { unavailable: true, reason: "AI evaluator yapılandırılmamış" };
  }

  const scored = scoreDraftFeatures(features, semantic);
  const predictedResidual = null;
  const confidence = Math.round(clamp(15 + Math.min(25, baseline.samples) + (semantic ? 20 : 0), 0, 60));

  return recordPostgresDraftEvaluation({
    draftId: input.draftId,
    accountId: input.account.id,
    categorySlug,
    mode: "shadow_cold_start",
    score: scored.score,
    confidence,
    predictedResidual,
    baseline,
    predictedViews: predictedMetric(baseline.medianViews, predictedResidual),
    predictedReplies: predictedMetric(baseline.medianReplies, predictedResidual),
    predictedReposts: predictedMetric(baseline.medianReposts, predictedResidual),
    predictedQuotes: predictedMetric(baseline.medianQuotes, predictedResidual),
    features,
    semantic: semanticMetadata,
    helped: scored.helped,
    hurt: scored.hurt,
    now,
  });
}
