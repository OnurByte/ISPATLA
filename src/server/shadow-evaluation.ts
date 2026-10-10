import { OfficialXClient } from "./official-x";
import { withOfficialAccount } from "./publisher";
import type { Account, RecentPost } from "./db-types";
import { getPostgresDb } from "./postgres";
import { accounts } from "./postgres-schema";
import { getPostgresAccounts } from "./postgres-accounts";
import { currentOwnerId, runAsOwner } from "./owner-context";
import type { AccountFitDecision } from "./account-fit";
import {
  appendObservedOutcome,
  listDuePublicationOutcomes,
  listEvaluationLabels,
  recordEvaluationPrediction,
  splitLeakageGroup,
  type EvaluationPrediction,
  type OfficialFollowerEvidence,
} from "./evaluation-store";

const MODEL_VERSION = "decision-score-v1";
const METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;

export type ShadowDecision = {
  post: RecentPost;
  account: Account;
  score: number;
  category: string;
  decision: "eligible" | "rejected" | "skipped";
  reason: string;
  createdAt: number;
  accountFit?: AccountFitDecision;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Persist the existing decision score and every account-level allow/reject/skip. */
export async function recordShadowDecision(input: ShadowDecision): Promise<EvaluationPrediction> {
  const owner = currentOwnerId();
  if (!owner || input.account.ownerUserId !== owner) throw new Error("shadow decision requires the account owner context");
  const category = input.category || "unclassified";
  const modelKey = `${MODEL_VERSION}:${category}`;
  const leakageGroup = input.post.clusterKey || input.post.externalId;
  const split = splitLeakageGroup(leakageGroup);
  const history = (await listEvaluationLabels(undefined, undefined, String(input.account.id)))
    .map(({ prediction }) => prediction)
    .filter((prediction) => prediction.modelKey === modelKey && prediction.category === category
      && prediction.split !== "holdout" && prediction.leakageGroup !== leakageGroup)
    .map((prediction) => prediction.rawScore);
  const baseline = median(history);
  const percentile = history.length
    ? (history.filter((score) => score < input.score).length + history.filter((score) => score === input.score).length / 2) / history.length
    : null;
  return recordEvaluationPrediction({
    accountId: String(input.account.id), candidateId: `${input.post.externalId}:decision:${input.createdAt}`, leakageGroup,
    modelKey, rawScore: input.score, selectorVersion: MODEL_VERSION, selectionPropensity: null,
    action: "post", category, format: "post", riskTier: "unknown",
    features: {
      ...(input.accountFit ? {
        accountFitVersion: input.accountFit.version,
        accountFitScore: input.accountFit.score,
        accountFitBasis: input.accountFit.confidenceBasis,
        accountFitReasons: JSON.stringify(input.accountFit.reasons),
        recommendedAction: input.accountFit.action,
        recommendedFormat: input.accountFit.format,
        formatReasons: JSON.stringify(input.accountFit.formatReasons),
        blockedFormats: JSON.stringify(input.accountFit.blocked),
        recommendationRiskTier: input.accountFit.riskTier,
        recommendationGrantsConsent: input.accountFit.publishConsent,
        sourceFatigueCount: input.accountFit.sourceFatigue.count,
        sourceFatigueBasis: input.accountFit.sourceFatigue.basis,
        timingEligibility: input.accountFit.timing.eligibility,
        quietHoursReason: input.accountFit.timing.quietHoursReason,
        publishWindowOpen: input.accountFit.timing.publishWindowOpen,
        recommendedLocalHour: input.accountFit.timing.recommendedLocalHour,
        bestTimeReason: input.accountFit.timing.bestTimeReason,
        bestTimeSamples: input.accountFit.timing.bestTimeSamples,
      } : {}),
      decision: input.decision, reason: input.reason, scoreKind: "existing_opportunity_decision_score",
      sourceCandidateId: input.post.externalId,
      evaluationSplit: split, explorationBucket: split === "holdout" ? "manual_review_holdout" : "none",
      accountBaseline: baseline, accountResidual: baseline === null ? null : input.score - baseline,
      accountPercentile: percentile, baselineSampleCount: history.length,
      baselineKind: "same_account_category_human_labeled_decision_scores",
    },
    createdAt: input.createdAt, resolveBy: input.createdAt + 14 * 86400,
  });
}

function remoteId(receipt: string, remoteUrl: string): string | null {
  const fromUrl = remoteUrl.match(/status\/(\d+)/)?.[1];
  if (fromUrl) return fromUrl;
  try {
    const value = JSON.parse(receipt) as Record<string, unknown>;
    const id = value.id ?? value.post_id ?? value.postId;
    return typeof id === "string" && /^\d+$/.test(id) ? id : null;
  } catch { return null; }
}

function epoch(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

/** Collect confirmed account-publication metrics; source observations stay separate. */
export async function collectDueShadowOutcomes(now = Math.floor(Date.now() / 1000), client = new OfficialXClient()): Promise<{ checked: number; collected: number; unresolved: number; failed: number }> {
  const owners = (await getPostgresDb().selectDistinct({ owner: accounts.ownerUserId }).from(accounts)).map(({ owner }) => owner);
  const result = { checked: 0, collected: 0, unresolved: 0, failed: 0 };
  let providerReads = 0;
  for (const owner of owners) await runAsOwner(owner, async () => {
    const due = await listDuePublicationOutcomes(now, 500);
    if (!due.length) return;
    const ownedAccounts = await getPostgresAccounts(owner);
    const followersByAccount = new Map<number, OfficialFollowerEvidence|null>();
    result.checked += due.length;
    for (const { prediction, accountId, remoteReceipt, remoteUrl, observationWindow } of due) {
      if (providerReads >= 20) { result.unresolved += 1; continue; }
      providerReads += 1;
      const account = ownedAccounts.find((item) => item.id === accountId && item.ownerUserId === owner);
      if (!account) { result.unresolved += 1; continue; }
      try {
        const id = remoteId(remoteReceipt, remoteUrl);
        if (!id) { result.unresolved += 1; continue; }
        const post = await withOfficialAccount(account, async (credential) => {
          if (!credential.scopes.includes("tweet.read")) return null;
          const observed = await client.getPost({ accessToken: credential.accessToken, xUserId: credential.xUserId }, id);
          if (observed?.id !== id || observed.author_id !== credential.xUserId) return null;
          if (!followersByAccount.has(account.id)) {
            followersByAccount.set(account.id, null);
            if (credential.scopes.includes("users.read") && providerReads < 20 && typeof client.getOwnProfile === "function") {
              providerReads += 1;
              try {
                const profile = await client.getOwnProfile({accessToken:credential.accessToken,xUserId:credential.xUserId});
                const count = profile.public_metrics && typeof profile.public_metrics === "object" ? (profile.public_metrics as Record<string,unknown>).followers_count : null;
                if (profile.id===credential.xUserId && typeof count==="number" && Number.isSafeInteger(count) && count>=0) followersByAccount.set(account.id,{count,observedAt:now,xUserId:credential.xUserId,provenanceRef:`official_x_user:${account.id}:${credential.xUserId}`});
              } catch { /* Missing profile access leaves the outcome usable without follower normalization. */ }
            }
          }
          return { observed, credential };
        });
        if (!post) { result.unresolved += 1; continue; }
        const publicMetrics = post.observed.public_metrics;
        const field = (name: string): number | null => {
          const value = publicMetrics && typeof publicMetrics === "object" ? (publicMetrics as Record<string, unknown>)[name] : null;
          return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
        };
        const observedAt = epoch(post.observed.created_at);
        if (observedAt === null || observedAt < prediction.createdAt || (observationWindow === "day" && (now-observedAt<86400 || now-observedAt>108000))) { result.unresolved += 1; continue; }
        const metrics = {
          views: field("impression_count"), likes: field("like_count"), replies: field("reply_count"),
          reposts: field("retweet_count") ?? field("repost_count"), quotes: field("quote_count"),
        };
        const censored = METRICS.filter((metric) => metrics[metric] === null);
        await appendObservedOutcome({
          predictionId: prediction.id, capturedAt: now, observedAt: now, metrics, censored, followersEvidence:followersByAccount.get(account.id) ?? null,
          source: "official_x_api", provenanceRef: `official_x:${account.id}:${id}:published_at=${observedAt}`,
        });
        result.collected += 1;
      } catch {
        result.failed += 1;
        result.unresolved += 1;
      }
    }
  });
  return result;
}
