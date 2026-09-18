import { aiConfigured, requestDraftSemanticFeatures, type AiProvider, type DraftSemanticFeatures } from "./ai";
import {
  draftPerformanceBaseline,
  recordDraftEvaluation,
  type Account,
  type DraftEvaluation,
} from "./db";

export type DraftMediaType = "none" | "photo" | "video" | "media";

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
  const baseline = draftPerformanceBaseline({
    accountId: input.account.id,
    format: input.format,
    categorySlug,
  });

  let semantic: DraftSemanticFeatures | null = null;
  let semanticMetadata: Record<string, unknown> = {};
  if (aiConfigured()) {
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
  const mature = baseline.samples >= 5;
  const predictedResidual = mature ? Number(clamp(0.65 + scored.score * 0.009, 0.55, 1.6).toFixed(3)) : null;
  const scopeConfidence = baseline.scope === "account_category_format" ? 35 : baseline.scope === "account_format" ? 28 : baseline.scope === "account" ? 20 : 0;
  const confidence = Math.round(clamp(15 + scopeConfidence + Math.min(25, baseline.samples) + (semantic ? 20 : 0), 0, 95));

  return recordDraftEvaluation({
    draftId: input.draftId,
    accountId: input.account.id,
    categorySlug,
    mode: mature ? "shadow_calibrated" : "shadow_cold_start",
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
