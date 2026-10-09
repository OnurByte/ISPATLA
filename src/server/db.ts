import legacyTransportSchema from "../../docs/migrations/legacy-transport-schema.json";
import { createHash, randomUUID } from "node:crypto";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { historicalPerformanceScore, isNumericalHit, observedEngagement, opportunityFreshness, opportunityScoreRelevanceAware, OPPORTUNITY_MAX_AGE_SECONDS, relevanceFactor, scorePost } from "./scoring";
import type { MetricSnapshot } from "./scoring";

// SQLite driver compat shim.
// Production runs on Node >= 22 and uses the built-in `node:sqlite` (DatabaseSync).
// Bun -- which runs the repo's `bun test` gate -- does not ship `node:sqlite`, so a
// static import makes every test file fail at resolve time. `bun:sqlite`'s `Database`
// exposes the same `exec` / `prepare().all()` surface this module uses, so we pick the
// driver at runtime via `process.getBuiltinModule` (Node >= 22.3, Bun >= 1.1): it is a
// plain runtime call, so neither Turbopack (`next dev`) nor webpack (`next build`) tries
// to resolve the specifier that is unavailable on the other runtime.
type NativeDatabase = { exec(sql: string): void; prepare(sql: string): { all(): unknown[] } };
type NativeDatabaseCtor = new (path: string) => NativeDatabase;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const DatabaseSync: NativeDatabaseCtor =
  typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
    ? (builtin("bun:sqlite") as { Database: NativeDatabaseCtor }).Database
    : (builtin("node:sqlite") as { DatabaseSync: NativeDatabaseCtor }).DatabaseSync;

export const IDEOLOGY_AXES = [
  "belirsiz",
  "aşırı sol",
  "sol",
  "merkez sol",
  "merkez",
  "merkez sağ",
  "sağ",
  "aşırı sağ",
] as const;
export type IdeologyAxis = string;

export const IDEOLOGY_TAGS = [
  "sosyalist",
  "sosyal demokrat",
  "liberal",
  "liberteryen",
  "muhafazakâr",
  "islamcı",
  "şeriatçı",
  "ümmetçi",
  "kemalist",
  "antikemalist",
  "ulusalcı",
  "türkçü",
  "milliyetçi",
  "kürtçü",
  "kürt milliyetçisi",
  "seküler",
  "lgbt+ hakları destekçisi",
  "lgbt+ karşıtı",
  "resmi-kurumsal",
  "haber-merkezli",
  "doğrulamacı",
] as const;
export type IdeologyTag = string;

export const IDEOLOGY_BASES = ["declared", "editorial", "observed", "insufficient_evidence"] as const;
export type IdeologyBasis = (typeof IDEOLOGY_BASES)[number];

export const PUBLIC_VERIFICATION_STATUSES = ["blue", "organization", "government", "not_verified", "unknown"] as const;
export type PublicVerificationStatus = (typeof PUBLIC_VERIFICATION_STATUSES)[number];
// Kept as an export alias while callers migrate from the old, misleading name.
export const BLUE_CHECK_STATUSES = PUBLIC_VERIFICATION_STATUSES;
export type BlueCheckStatus = PublicVerificationStatus;

export const SUBSCRIPTION_TIERS = ["unknown", "free", "basic", "premium", "premium_plus", "organization"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];
export type AccountSubscriptionEvent = { id: number; tier: SubscriptionTier; effectiveAt: number; createdAt: number; updatedAt: number };
export type AccountSubscriptionState = { tier: SubscriptionTier; observedAt: number; historyComplete: boolean };

export type SourceProfile = {
  identityHandle?: string;
  niche?: string;
  ideology?: IdeologyAxis;
  ideologyTags?: IdeologyTag[];
  ideologyConfidence?: number;
  ideologyBasis?: IdeologyBasis;
  ideologyReason?: string;
  tone?: string;
  topics?: string[];
  certainty?: string;
  origin?: "seed" | "manual" | "discovered";
  status?: "candidate" | "active";
  pinned?: boolean;
  avatarUrl?: string;
  bio?: string;
  followers?: number;
  parentHandles?: string[];
  evidenceWeight?: number;
  lastEvidenceAt?: number;
  sourceScore?: number;
  sourceConfidence?: number;
  sourceRisk?: number;
  scoreReason?: string;
  scoreModel?: string;
  lastSeenAt?: number;
  lastScoredAt?: number;
  lowScoreStreak?: number;
  historicalPerformance?: number | null;
  blueCheckStatus?: BlueCheckStatus;
  // --- Source relevance (Jev) --- additive, written only when jev_mode is not "off".
  sourceRelevanceSource?: "jev" | "openai" | "openai_fallback";
  jevRelevance?: number;
  jevCategoryScores?: Record<string, number>;
  jevDiagnostics?: string[];
};

export type SourceConfig = {
  handle: string;
  name: string;
  enabled: boolean;
  maxPosts: number;
  rightsStatus: "cleared" | "unknown" | "prohibited";
  profile: SourceProfile;
};

export type DeletedSource = { handle: string; score: number; reason: string; model: string; deletedAt: number };

export type ObservedPost = {
  externalId: string;
  sourceHandle: string;
  authorHandle: string;
  statusUrl: string;
  text: string;
  createdTimestamp: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views: number;
  followers?: number;
  blueCheckStatus?: BlueCheckStatus;
  mediaCount: number;
  mediaJson: string;
  rawJson: string;
  score: number;
  scoreReason: string;
  sensitive: boolean;
  clusterKey: string;
  /** Layered Jev relevance (migration 17). null / absent means "no relevance evidence". */
  relevanceScore?: number | null;
  relevanceSource?: string | null;
  relevanceJson?: string | null;
  relevanceAt?: number | null;
};

export type RecentPost = ObservedPost & {
  observedAt: number;
  draftText: string;
  draftStatus: string;
  publishStatus: string;
};

export type ActivityPoint = {
  label: string;
  observed: number;
  opportunities: number;
};

export type DashboardSummary = {
  generatedAt: number;
  dbAvailable: boolean;
  dbError?: string;
  sourcesConfigured: number;
  sourcesObserved: number;
  postsObserved: number;
  postsLast24h: number;
  opportunities: number;
  attemptsPending: number;
  publishedConfirmed: number;
  publishBlocked: number;
  automationRuntime: { owner: "worker" | "web" | "none"; heartbeatAt: number | null; healthy: boolean; lagSeconds: number | null };
  automationEnabled: boolean;
  openaiConfigured: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  aiProvider: "api" | "compatible" | "codex" | "anthropic" | "chatgpt";
  officialPublisherConfigured: boolean;
  recentPosts: RecentPost[];
  activity: ActivityPoint[];
  lastRun: {
    status: string;
    finishedAt: number;
    sourceCount: number;
    postsSeen: number;
    postsNew: number;
    errors: string;
  } | null;
};

export const AUTOMATION_TASK_IDS = ["monitor_engine", "source_scan", "source_liveness", "queue_worker", "reconciliation", "account_inference"] as const;
export type AutomationTaskId = (typeof AUTOMATION_TASK_IDS)[number];
export type AutomationTaskStatus = "never" | "running" | "success" | "partial" | "failed" | "skipped";
export type AutomationTaskSchedule = { id: AutomationTaskId; enabled: boolean; intervalSeconds: number; nextRunAt: number; lastRunAt: number; lastStatus: AutomationTaskStatus; updatedAt: number };
export type AutomationLog = { id: number; taskId: AutomationTaskId; status: AutomationTaskStatus; startedAt: number; finishedAt: number | null; message: string; details: Record<string, unknown> };

export type Account = {
  id: number;
  ownerUserId?: string | null;
  accountKey: string;
  handle: string;
  displayName: string;
  enabled: boolean;
  defaultAccount: boolean;
  automationMode: "manual" | "auto";
  dailyLimit: number;
  capabilities: string[];
  styleProfile: Record<string, unknown>;
  subscriptionHistory: AccountSubscriptionEvent[];
  subscriptionState: AccountSubscriptionState;
  publicVerificationStatus?: PublicVerificationStatus;
  updatedAt: number;
};

export const CATEGORY_BASE_STRATEGIES = ["news", "politics", "technology", "finance", "sports", "entertainment", "meme", "shitpost", "generic"] as const;
export type CategoryBaseStrategy = (typeof CATEGORY_BASE_STRATEGIES)[number];
export const CATEGORY_CLUSTER_STRATEGIES = ["event", "topic", "meme", "conversation", "format", "hybrid"] as const;
export type CategoryClusterStrategy = (typeof CATEGORY_CLUSTER_STRATEGIES)[number];
export const CATEGORY_VERIFICATION_MODES = ["strict", "moderate", "minimal", "none"] as const;
export type CategoryVerificationMode = (typeof CATEGORY_VERIFICATION_MODES)[number];

export type CategoryDefinition = {
  id: number;
  slug: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  baseStrategy: CategoryBaseStrategy;
  clusterStrategy: CategoryClusterStrategy;
  verificationMode: CategoryVerificationMode;
  description: string;
  positiveExamples: string[];
  negativeExamples: string[];
  keywords: string[];
  excludedKeywords: string[];
  seedHandles: string[];
  defaultFormats: string[];
  sourcePolicy: Record<string, unknown>;
  riskPolicy: Record<string, unknown>;
  scoringPolicy: Record<string, unknown>;
  publishingPolicy: Record<string, unknown>;
  aiContext: string;
  createdAt: number;
  updatedAt: number;
  ownerUserId?: string | null;
  accountId?: number | null;
};

export function canonicalCategorySlugs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set(getCategories().map((category) => category.slug));
  const slugs = [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
  return slugs.every((slug) => known.has(slug)) ? slugs.slice(0, 12) : null;
}

export type AccountCategoryConfig = {
  accountId: number;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  enabled: boolean;
  primary: boolean;
  weight: number;
  priority: number;
  publishThreshold: number | null;
  dailyBudget: number | null;
  styleOverride: Record<string, unknown>;
  aiRouteOverride: Record<string, unknown>;
  source?: "manual" | "inferred" | "imported";
  userModifiedAt?: number | null;
};

export type AccountCategoryInferenceResult = {
  status: "ready" | "insufficient_evidence";
  contentLanguage: string;
  suggestions: Array<{ categoryId: number; slug: string; name: string; confidence: number; evidence: string[] }>;
};
export type AccountCategoryInferenceJob = { id: number; accountId: number; status: string; version: number; updatedAt: number; result: AccountCategoryInferenceResult | null };

export type SourceCategoryConfig = {
  accountId?: number;
  sourceHandle: string;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  monitoringTier: "A" | "B" | "C";
  discoveryWeight: number;
  categoryReputation: number | null;
  enabled: boolean;
  lastEvidenceAt: number;
};

export type Competitor = {
  id: number;
  handle: string;
  name: string;
  category: string;
  enabled: boolean;
  initializedAt: number;
  lastSuccessAt: number;
  lastError: string;
  createdAt: number;
  updatedAt: number;
};

export type PublicMetrics = {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views: number;
  pollVotes: number;
};

export const DEFAULT_ACCOUNT_STYLE = {
  tone: "sade, kanıt odaklı, kısa",
  ideology: "belirsiz",
  opening: "doğrudan başlık",
  emoji: "kullanma",
  attribution: "otomatik atıf yazma",
  formatRule: "tek paragraf, kısa cümle, hashtag yok",
} as const;

export const DEFAULT_EDITORIAL_INSTRUCTION = "Türkçe X içerik editörüsün. Kısa, olgusal ve özgün yaz; kaynakta olmayan kesinlik ekleme. En güçlü bilgiyi doğrudan ver, clickbait ve şablon ifadeler kullanma.";
const EDITORIAL_INSTRUCTION_MAX_LENGTH = 6000;

function readEditorialInstruction(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const instruction = value.trim();
  return instruction && instruction.length <= EDITORIAL_INSTRUCTION_MAX_LENGTH ? instruction : fallback;
}

function writeEditorialInstruction(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error("editoryal yönerge metin olmalı");
  const instruction = value.trim();
  if (instruction.length > EDITORIAL_INSTRUCTION_MAX_LENGTH) throw new Error("editoryal yönerge en fazla 6000 karakter olabilir");
  return instruction || fallback;
}

export type WritingSkill = {
  id: "newsroom-style" | "humanize-writing";
  name: string;
  sourceUrl: string;
  reviewedRevision: string;
  enabled: boolean;
  instructions: string;
};

export type WritingStyleSettings = {
  exampleStyle: Record<string, unknown>;
  skills: WritingSkill[];
};

const DEFAULT_WRITING_SKILLS: WritingSkill[] = [
  {
    id: "newsroom-style",
    name: "newsroom-style",
    sourceUrl: "https://www.skills.sh/jamditis/claude-skills-journalism/newsroom-style",
    reviewedRevision: "skills.sh snapshot · 2026-08-30",
    enabled: true,
    instructions: "Haberi kısa, doğrudan ve olgu odaklı kur. En önemli bilgiyle başla; gereksiz sıfat, tekrar ve clickbait kullanma. Kaynaktaki belirsizliği kesin bilgiye çevirme.",
  },
  {
    id: "humanize-writing",
    name: "humanize-writing",
    sourceUrl: "https://www.skills.sh/leo1oel/leo-agent-skills/humanize-writing",
    reviewedRevision: "skills.sh snapshot · 2026-08-30",
    enabled: true,
    instructions: "Kaynak olgularını ve belirsizliğini koru; metni doğal, özgün Türkçe ile baştan kur. Cümle yapısını veya kelime dizisini kaynak metinden kopyalama. Yapay zekâ klişeleri, şablon geçişler ve gereksiz önem vurgusunu temizle.",
  },
];

export type MarketItem = Omit<RecentPost, "rawJson"> & {
  momentum: number;
  freshness: number;
  velocity: number;
  relevance: number;
  risk: number;
  engagementRate: number;
  engagements: number;
  hit: boolean;
  marketStatus: "new" | "drafted" | "queued" | "published" | "ignored";
  decision: MarketDecision;
  scoreEvidence: ScoreEvidence;
  /** Layered relevance evidence (Faz B3); null when the post was never Jev-ranked. */
  jevRelevance: number | null;
  jevRelevanceFactor: number;
  jevRelevanceSource: string;
  jevRelevanceAt: number;
  jevRelevanceApplied: boolean;
};

export const MARKET_VIEWS = ["opportunities", "observed", "rejected", "sensitive"] as const;
export type MarketView = typeof MARKET_VIEWS[number];
export type MarketDecision = "opportunity" | "below_threshold" | "expired" | "processed" | "not_eligible_evidence" | "sensitive";
export type MarketInbox = {
  items: MarketItem[];
  total: number;
  counts: { opportunities: number; observed: number; rejected: number; sensitive: number };
};

export type ScoreEvidence = {
  kind: "deterministic" | "hybrid" | "heuristic";
  momentum: number;
  ai: number;
  risk: number;
  confidence: number;
  model: string;
  reason: string;
  categories: string[];
  breaking: boolean;
  breakingReason: string;
};

export type DraftPerformanceBaseline = {
  scope: "account_category_format" | "account_format" | "account" | "none";
  samples: number;
  medianViews: number | null;
  medianLikes: number | null;
  medianReplies: number | null;
  medianReposts: number | null;
  medianQuotes: number | null;
  medianEngagementRate: number | null;
};

export type DraftEvaluation = {
  id: number;
  draftId: number;
  accountId: number | null;
  categorySlug: string;
  mode: "shadow_calibrated" | "shadow_cold_start";
  score: number;
  confidence: number;
  predictedResidual: number | null;
  baseline: DraftPerformanceBaseline;
  predictedViews: number | null;
  predictedReplies: number | null;
  predictedReposts: number | null;
  predictedQuotes: number | null;
  features: Record<string, unknown>;
  semantic: Record<string, unknown>;
  helped: string[];
  hurt: string[];
  createdAt: number;
  updatedAt: number;
};

export type DraftRecord = {
  id: number;
  batchId: string;
  origin: string;
  prompt: string;
  provider: string;
  model: string;
  variantMode: string;
  sourceHandle: string;
  sourceUrl: string;
  externalId: string;
  accountId: number | null;
  accountHandle: string;
  format: string;
  text: string;
  status: string;
  gateReason: string;
  score: number;
  evaluation: DraftEvaluation | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationJob = {
  id: number;
  draftId: number;
  accountId: number | null;
  accountHandle: string;
  action: string;
  scheduledAt: number;
  status: string;
  receipt: string;
  reason: string;
  remoteUrl: string;
  reconciliationStatus: string;
  attempts: number;
  maxAttempts: number;
  leaseToken: string | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
  nextAttemptAt: number;
  errorClass: string;
  deadLetteredAt: number | null;
  approvalExpiresAt: number | null;
  approvalSnapshotId: number | null;
  remoteWriteStartedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationJobEvent = { id: number; jobId: number; event: string; status: string; errorClass: string; createdAt: number };
export type AutomationJobLease = { job: AutomationJob; leaseToken: string; leaseUntil: number };
export type AccountDispatchLease = { accountId: number; leaseToken: string; leaseUntil: number };
export type PublicationPolicyHistoryRow = {
  recordType: "publication_intent" | "automation_job";
  recordId: number;
  accountId: number;
  status: string;
  action: string;
  text: string;
  clusterId: number | null;
  sourceHandle: string;
  targetId: string;
  createdAt: number;
  updatedAt: number;
  sendStartedAt: number | null;
  confirmedAt: number | null;
  publishedAt: number | null;
  potentialBudgetUsed: boolean;
};

export type AccountOpportunity = {
  id: number;
  clusterId: number;
  accountId: number;
  status: string;
  primaryCategoryId: number | null;
  matchedCategoryIds: number[];
  categoryScores: Record<string, number>;
  expectedIncrementalReach: number;
  publishConfidence: number;
  createdAt: number;
  updatedAt: number;
};

export type Publication = {
  id: number;
  clusterId: number;
  accountOpportunityId: number;
  accountId: number;
  sourceObservationExternalId: string;
  remotePostId: string;
  remoteUrl: string;
  status: string;
  requestedAt: number;
  confirmedAt: number | null;
};

export const MONITOR_KINDS = ["account", "keyword", "search_query", "conversation"] as const;
export type MonitorKind = (typeof MONITOR_KINDS)[number];
export type MonitorTier = "hot" | "warm" | "normal" | "cold";
export type MonitorBucket = "proven_alpha" | "hot_categories" | "discovery" | "challengers" | "reconciliation" | "exploration";
export type MonitorTarget = {
  id: number;
  kind: MonitorKind;
  key: string;
  categoryId: number | null;
  sourceHandle: string;
  query: string;
  conversationId: string;
  lifecycle: "challenger" | "active" | "retired";
  tier: MonitorTier;
  intervalSeconds: number;
  burstUntil: number;
  nextRunAt: number;
  enabled: boolean;
  priority: number;
  runs: number;
  results: number;
  uniqueResults: number;
  hits: number;
  duplicates: number;
  falsePositives: number;
  reviewed: number;
  leadTimeTotal: number;
  lastResultAt: number;
  lastHitAt: number;
  createdAt: number;
  updatedAt: number;
};

export type PublicationIntentStatus = "pending_approval" | "approved" | "dispatching" | "pending_reconciliation" | "confirmed" | "blocked" | "cancelled" | "expired" | "reconciliation_required" | "dead_letter";
export type PublicationIntent = {
  id: number;
  draftId: number;
  accountId: number;
  accountHandle: string;
  status: PublicationIntentStatus;
  idempotencyKey: string;
  text: string;
  mediaPath: string;
  mediaHash: string;
  receipt: string;
  remoteUrl: string;
  remotePostId: string;
  reason: string;
  requestedAt: number;
  approvedAt: number | null;
  approvalExpiresAt: number | null;
  approvalSnapshotId: number | null;
  dispatchedAt: number | null;
  confirmedAt: number | null;
  updatedAt: number;
  leaseToken: string | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  errorClass: string;
  deadLetteredAt: number | null;
  remoteWriteStartedAt: number | null;
};

export type PublicationIntentEvent = { id: number; intentId: number; event: string; status: string; errorClass: string; createdAt: number };
export type PublicationIntentLease = { intent: PublicationIntent; leaseToken: string; leaseUntil: number };

export type DraftBatch = {
  id: string;
  prompt: string;
  format: string;
  variantMode: "per_account" | "same_text";
  accountIds: number[];
  provider: string;
  model: string;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export type UsageEvent = {
  id: number;
  kind: string;
  provider: string;
  model: string;
  units: number;
  estimatedUsd: number;
  metadata: Record<string, unknown>;
  createdAt: number;
};

export type SecretMeta = {
  name: string;
  provider: string;
  configured: boolean;
  masked: string;
  updatedAt: number;
};

let DATABASE_PATH =
  process.env.ISPATLA_DB || join(/* turbopackIgnore: true */ process.cwd(), "state", "ispatla.sqlite3");

const LEGACY_CATEGORY_SLUGS: Record<string, string> = {
  haber: "news",
  news: "news",
  siyaset: "politics",
  politics: "politics",
  teknoloji: "technology",
  technology: "technology",
  finans: "finance",
  ekonomi: "finance",
  finance: "finance",
  spor: "sports",
  sports: "sports",
  magazin: "entertainment",
  eglence: "entertainment",
  entertainment: "entertainment",
  meme: "meme",
  shitpost: "shitpost",
  kultur: "culture",
  culture: "culture",
};

let initialized = false;
let initializationError: string | undefined;
let database: NativeDatabase | undefined;
const SCORE_VERSION = "2";

function ownerSql(column = "owner_user_id"): string {
  const ownerId = currentOwnerId();
  return ownerId === undefined ? "" : `${column}=${sqlString(ownerId)}`;
}

function requireOwnedAccount(id: number): void {
  const ownerId = currentOwnerId();
  if (ownerId === undefined) return;
  if (!rows<{ id: number }>(`SELECT id FROM accounts WHERE id=${sqlNumber(id)} AND owner_user_id=${sqlString(ownerId)} LIMIT 1;`).length) {
    throw new Error("account not found");
  }
}

function requireValidOptionalAccount(id: number | null | undefined): void {
  if (id === null || id === undefined) return;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("account id is invalid");
  requireOwnedAccount(id);
}

function accountDispatchLeaseGuard(accountColumn: string, leaseToken: string | undefined, now: number): string {
  const accountLease = `account_dispatch_leases AS account_lease WHERE account_lease.account_id=${accountColumn}`;
  if (leaseToken === undefined) return `NOT EXISTS (SELECT 1 FROM ${accountLease})`;
  return `EXISTS (SELECT 1 FROM ${accountLease} AND account_lease.lease_token=${sqlString(leaseToken)} AND account_lease.lease_until>${sqlNumber(now)})`;
}

type FinalSendAuthorization = {
  ownerUserId: string; mode: "assist" | "auto"; consentVersion: number; policyVersion: string; copyVersion: string;
  xUserId: string; credentialVersion: number;
  category?: string; autonomyEvidenceHash?: string; autonomyModelKey?: string; autonomySelectorVersion?: string;
};

function finalSendAuthorizationGuard(input: FinalSendAuthorization | undefined, accountExpr: string, actionExpr: string, snapshotExpr: string): string {
  // ponytail: absent authorization remains available to low-level lease/recovery fixtures; provider dispatch callers must always pass a fresh authorization snapshot.
  if (!input) return "1=1";
  // The OAuth store persists the user-facing Assist mode as `manual`.
  const owner = sqlString(input.ownerUserId), mode = sqlString(input.mode === "assist" ? "manual" : "auto"), action = actionExpr;
  const autonomy = input.mode === "auto" && input.category && input.autonomyEvidenceHash && input.autonomyModelKey && input.autonomySelectorVersion ? `AND EXISTS (
      SELECT 1 FROM scoped_autonomy autonomy JOIN autonomy_suggestions suggestion
        ON suggestion.id=autonomy.suggestion_id AND suggestion.owner_user_id=autonomy.owner_user_id
      WHERE autonomy.owner_user_id=${owner} AND autonomy.account_id=CAST(${accountExpr} AS TEXT)
        AND autonomy.action=${action} AND autonomy.category=${sqlString(input.category)} AND autonomy.risk_tier='low'
        AND autonomy.disabled_at IS NULL AND autonomy.model_key=${sqlString(input.autonomyModelKey)} AND autonomy.selector_version=${sqlString(input.autonomySelectorVersion)}
        AND suggestion.status='accepted' AND suggestion.evidence_hash=${sqlString(input.autonomyEvidenceHash)}
        AND suggestion.model_key=autonomy.model_key AND suggestion.selector_version=autonomy.selector_version
        AND suggestion.model_key=${sqlString(input.autonomyModelKey)} AND suggestion.selector_version=${sqlString(input.autonomySelectorVersion)}
        AND EXISTS (SELECT 1 FROM evaluation_predictions active_pin
          WHERE active_pin.owner_user_id=${owner} AND active_pin.account_id=CAST(${accountExpr} AS TEXT)
            AND active_pin.action=${action} AND active_pin.category=${sqlString(input.category)}
            AND active_pin.model_key=${sqlString(input.autonomyModelKey)} AND active_pin.selector_version=${sqlString(input.autonomySelectorVersion)}
            AND NOT EXISTS (SELECT 1 FROM evaluation_predictions newer_pin
              WHERE newer_pin.owner_user_id=active_pin.owner_user_id AND newer_pin.account_id=active_pin.account_id
                AND newer_pin.action=active_pin.action AND newer_pin.category=active_pin.category
                AND (newer_pin.created_at>active_pin.created_at OR (newer_pin.created_at=active_pin.created_at AND newer_pin.id>active_pin.id))))
        AND EXISTS (SELECT 1 FROM account_categories mapping JOIN categories category ON category.id=mapping.category_id
          WHERE mapping.account_id=${accountExpr} AND mapping.enabled=1 AND category.slug=${sqlString(input.category)})
        AND NOT EXISTS (SELECT 1 FROM evaluation_labels incident JOIN evaluation_predictions labeled
          ON labeled.id=incident.prediction_id AND labeled.owner_user_id=incident.owner_user_id
          WHERE labeled.owner_user_id=${owner} AND labeled.account_id=CAST(${accountExpr} AS TEXT)
            AND labeled.action=${action} AND labeled.category=${sqlString(input.category)}
            AND labeled.model_key=${sqlString(input.autonomyModelKey)} AND labeled.selector_version=${sqlString(input.autonomySelectorVersion)}
            AND incident.label IN ('policy_block','wrong_account','wrong_format','publisher_failure','cannibalization'))
        AND NOT EXISTS (SELECT 1 FROM autonomy_audit incident
          WHERE incident.owner_user_id=${owner} AND incident.account_id=CAST(${accountExpr} AS TEXT)
            AND incident.action=${action} AND incident.category=${sqlString(input.category)}
            AND incident.event='demoted' AND incident.reason IN ('policy_failure','auth_uncertainty','duplicate_risk','unacceptable_outcome'))
        AND NOT EXISTS (SELECT 1 FROM publication_intents intent JOIN drafts incident_draft ON incident_draft.id=intent.draft_id
          JOIN evaluation_predictions incident_prediction ON incident_prediction.owner_user_id=incident_draft.owner_user_id
            AND incident_prediction.account_id=CAST(intent.account_id AS TEXT)
            AND json_extract(incident_prediction.features_json,'$.sourceCandidateId')=incident_draft.external_id
          JOIN publication_intent_events incident_event ON incident_event.intent_id=intent.id
          WHERE incident_draft.owner_user_id=${owner} AND intent.account_id=${accountExpr}
            AND incident_prediction.action=${action} AND incident_prediction.category=${sqlString(input.category)}
            AND incident_prediction.model_key=${sqlString(input.autonomyModelKey)} AND incident_prediction.selector_version=${sqlString(input.autonomySelectorVersion)}
            AND (intent.status='blocked' OR incident_event.error_class IN ('policy_blocked','reauth'))))` : input.mode === "auto" ? "AND 1=0" : "";
  const human = input.mode === "assist" ? `AND EXISTS (SELECT 1 FROM publication_approval_snapshots approval
        WHERE approval.id=${snapshotExpr} AND approval.approval_source='human')` : "";
  return `EXISTS (SELECT 1 FROM accounts account JOIN x_oauth_accounts grant_account ON grant_account.account_id=account.id
      JOIN x_oauth_credentials credential ON credential.account_id=account.id
      JOIN automation_consents consent ON consent.account_id=account.id AND consent.action_type=${action}
      WHERE account.id=${accountExpr} AND account.owner_user_id=${owner} AND account.enabled=1
        AND grant_account.owner_user_id=${owner} AND grant_account.auth_state='connected' AND grant_account.x_user_id=${sqlString(input.xUserId)}
        AND credential.owner_user_id=${owner} AND credential.revoked_at IS NULL AND credential.token_version=${sqlNumber(input.credentialVersion)}
        AND consent.owner_user_id=${owner} AND consent.mode=${mode} AND consent.version=${sqlNumber(input.consentVersion)}
        AND consent.policy_version=${sqlString(input.policyVersion)} AND consent.consent_copy_version=${sqlString(input.copyVersion)}
        ${input.mode === "auto" ? "AND consent.revoked_at IS NULL" : ""} ${human} ${autonomy})`;
}

const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  max_posts INTEGER NOT NULL DEFAULT 20,
  rights_status TEXT NOT NULL DEFAULT 'unknown',
  profile_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS source_events (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL,
  event TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS source_events_handle_idx
  ON source_events(handle, created_at DESC);
CREATE TABLE IF NOT EXISTS observed_posts (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  source_handle TEXT NOT NULL,
  author_handle TEXT NOT NULL DEFAULT '',
  status_url TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  created_timestamp INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  quotes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  author_followers INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  media_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  score REAL NOT NULL DEFAULT 0,
  score_reason TEXT NOT NULL DEFAULT '',
  sensitive INTEGER NOT NULL DEFAULT 0,
  cluster_key TEXT NOT NULL DEFAULT '',
  draft_status TEXT NOT NULL DEFAULT 'not_started',
  draft_text TEXT NOT NULL DEFAULT '',
  publish_status TEXT NOT NULL DEFAULT 'not_started',
  observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS observed_posts_score_idx
  ON observed_posts(score DESC, observed_at DESC);
CREATE INDEX IF NOT EXISTS observed_posts_cluster_idx
  ON observed_posts(cluster_key, publish_status);
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  posts_seen INTEGER NOT NULL DEFAULT 0,
  posts_new INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ok'
);
CREATE TABLE IF NOT EXISTS publish_attempts (
  id INTEGER PRIMARY KEY,
  post_external_id TEXT NOT NULL,
  account_id INTEGER,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  receipt TEXT NOT NULL DEFAULT '',
  remote_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  occurrences INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS publish_attempts_status_idx
  ON publish_attempts(status, created_at DESC);
CREATE TABLE IF NOT EXISTS feedback_snapshots (
  id INTEGER PRIMARY KEY,
  post_external_id TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  quotes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  poll_votes INTEGER NOT NULL DEFAULT 0,
  milestone TEXT NOT NULL DEFAULT 'legacy',
  captured_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  account_key TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  default_account INTEGER NOT NULL DEFAULT 0,
  automation_mode TEXT NOT NULL DEFAULT 'manual',
  daily_limit INTEGER NOT NULL DEFAULT 24,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  style_profile_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_metric_snapshots (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  following INTEGER NOT NULL DEFAULT 0,
  statuses INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS account_metric_snapshots_account_idx
  ON account_metric_snapshots(account_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  initialized_at INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS competitor_profile_snapshots (
  id INTEGER PRIMARY KEY,
  competitor_id INTEGER NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  following INTEGER NOT NULL DEFAULT 0,
  statuses INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER NOT NULL,
  FOREIGN KEY(competitor_id) REFERENCES competitors(id)
);
CREATE INDEX IF NOT EXISTS competitor_profile_snapshots_competitor_idx
  ON competitor_profile_snapshots(competitor_id, captured_at DESC);
CREATE TABLE IF NOT EXISTS competitor_posts (
  id INTEGER PRIMARY KEY,
  competitor_id INTEGER NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  status_url TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  created_timestamp INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  quotes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  poll_votes INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  media_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at INTEGER NOT NULL,
  FOREIGN KEY(competitor_id) REFERENCES competitors(id)
);
CREATE INDEX IF NOT EXISTS competitor_posts_competitor_idx
  ON competitor_posts(competitor_id, created_timestamp DESC);
CREATE TABLE IF NOT EXISTS competitor_post_snapshots (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  quotes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  poll_votes INTEGER NOT NULL DEFAULT 0,
  milestone TEXT NOT NULL DEFAULT 'history',
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS competitor_post_snapshots_post_milestone_idx
  ON competitor_post_snapshots(external_id, milestone, captured_at DESC);
CREATE TABLE IF NOT EXISTS secrets (
  name TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT '',
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_logs (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS automation_logs_task_idx ON automation_logs(task_id, started_at DESC);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY,
  batch_id TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'manual',
  prompt TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  variant_mode TEXT NOT NULL DEFAULT 'same_text',
  source_handle TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_score REAL NOT NULL DEFAULT 0,
  external_id TEXT NOT NULL DEFAULT '',
  account_id INTEGER,
  format TEXT NOT NULL DEFAULT 'post',
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  gate_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS automation_jobs (
  id INTEGER PRIMARY KEY,
  draft_id INTEGER NOT NULL,
  account_id INTEGER,
  action TEXT NOT NULL DEFAULT 'post',
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  receipt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  remote_url TEXT NOT NULL DEFAULT '',
  reconciliation_status TEXT NOT NULL DEFAULT 'not_started',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(draft_id) REFERENCES drafts(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS automation_jobs_status_idx ON automation_jobs(status, scheduled_at ASC);
CREATE TABLE IF NOT EXISTS draft_batches (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'post',
  variant_mode TEXT NOT NULL DEFAULT 'per_account',
  account_ids_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  units INTEGER NOT NULL DEFAULT 1,
  estimated_usd REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at DESC);
`;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : "0";
}

function sqlReal(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "NULL" : String(value);
}

function sqlBool(value: boolean): string {
  return value ? "1" : "0";
}

function opportunityWhere(now: number): string {
  return `sensitive=0 AND created_timestamp >= ${sqlNumber(now - OPPORTUNITY_MAX_AGE_SECONDS)} AND created_timestamp <= ${sqlNumber(now + 300)} AND publish_status NOT IN ('confirmed','pending_reconciliation')`;
}

function command(sql: string, json = false): unknown[] {
  if (!database) throw new Error("database connection unavailable");
  if (!json) {
    database.exec(sql);
    return [];
  }
  return database.prepare(sql).all();
}

function hasColumn(table: string, column: string): boolean {
  return (command(`PRAGMA table_info(${table});`, true) as Array<{ name?: string }>).some((item) => item.name === column);
}

function hasTable(table: string): boolean {
  return rows<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name=${sqlString(table)} LIMIT 1;`).length > 0;
}

function addColumn(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) command(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function blueCheckStatusFromRecord(value: unknown): BlueCheckStatus {
  const verification = object(object(value).verification);
  if (verification.verified === false) return "not_verified";
  const type = String(verification.type || "").trim().toLocaleLowerCase("en-US");
  if (verification.verified === true && type === "individual") return "blue";
  if (verification.verified === true && type === "organization") return "organization";
  if (verification.verified === true && type === "government") return "government";
  return "unknown";
}

function blueCheckStatusFromRawJson(rawJson: string): BlueCheckStatus {
  try {
    const raw = object(JSON.parse(rawJson));
    const tweet = object(raw.tweet || raw.status || raw);
    return blueCheckStatusFromRecord(object(tweet.author));
  } catch {
    return "unknown";
  }
}

function applyMigrations(): void {
  const applied = new Set((command("SELECT version FROM schema_migrations;", true) as Array<{ version: number }>).map((item) => item.version));
  if (!applied.has(1)) {
    command("BEGIN;");
    try {
      addColumn("observed_posts", "first_seen_at", "INTEGER NOT NULL DEFAULT 0");
      addColumn("observed_posts", "last_seen_at", "INTEGER NOT NULL DEFAULT 0");
      addColumn("observed_posts", "last_metrics_at", "INTEGER NOT NULL DEFAULT 0");
      addColumn("observed_posts", "reader_received_at", "INTEGER NOT NULL DEFAULT 0");
      command(`UPDATE observed_posts SET
        first_seen_at=CASE WHEN first_seen_at=0 THEN observed_at ELSE first_seen_at END,
        last_seen_at=CASE WHEN last_seen_at=0 THEN observed_at ELSE last_seen_at END,
        last_metrics_at=CASE WHEN last_metrics_at=0 THEN observed_at ELSE last_metrics_at END,
        reader_received_at=CASE WHEN reader_received_at=0 THEN observed_at ELSE reader_received_at END;`);
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (1, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(2)) {
    command("BEGIN;");
    try {
      command(`CREATE TABLE IF NOT EXISTS opportunity_clusters (
        id INTEGER PRIMARY KEY,
        cluster_key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'hybrid',
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cluster_observations (
        cluster_id INTEGER NOT NULL,
        post_external_id TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        PRIMARY KEY(cluster_id, post_external_id),
        FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id)
      );
      CREATE TABLE IF NOT EXISTS account_opportunities (
        id INTEGER PRIMARY KEY,
        cluster_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'candidate',
        primary_category_id INTEGER,
        matched_category_ids_json TEXT NOT NULL DEFAULT '[]',
        category_scores_json TEXT NOT NULL DEFAULT '{}',
        expected_incremental_reach REAL NOT NULL DEFAULT 0,
        publish_confidence REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(cluster_id, account_id),
        FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id),
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );
      CREATE TABLE IF NOT EXISTS publications (
        id INTEGER PRIMARY KEY,
        cluster_id INTEGER NOT NULL,
        account_opportunity_id INTEGER NOT NULL UNIQUE,
        account_id INTEGER NOT NULL,
        source_observation_external_id TEXT NOT NULL DEFAULT '',
        remote_post_id TEXT NOT NULL DEFAULT '',
        remote_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        confirmed_at INTEGER,
        FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id),
        FOREIGN KEY(account_opportunity_id) REFERENCES account_opportunities(id),
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );
      CREATE INDEX IF NOT EXISTS publications_status_idx ON publications(status, requested_at ASC);
      CREATE INDEX IF NOT EXISTS publications_remote_post_idx ON publications(account_id, remote_post_id);
      CREATE TABLE IF NOT EXISTS publication_metric_snapshots (
        id INTEGER PRIMARY KEY,
        publication_id INTEGER NOT NULL,
        remote_post_id TEXT NOT NULL DEFAULT '',
        milestone TEXT NOT NULL,
        likes INTEGER,
        replies INTEGER,
        reposts INTEGER,
        quotes INTEGER,
        views INTEGER,
        poll_votes INTEGER,
        metric_quality TEXT NOT NULL DEFAULT 'ok',
        captured_at INTEGER NOT NULL,
        FOREIGN KEY(publication_id) REFERENCES publications(id)
      );
      CREATE INDEX IF NOT EXISTS publication_metric_snapshots_publication_idx
        ON publication_metric_snapshots(publication_id, milestone, captured_at DESC);`);
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (2, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(3)) {
    command("BEGIN;");
    try {
      command(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        built_in INTEGER NOT NULL DEFAULT 0,
        base_strategy TEXT NOT NULL,
        cluster_strategy TEXT NOT NULL,
        verification_mode TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        positive_examples_json TEXT NOT NULL DEFAULT '[]',
        negative_examples_json TEXT NOT NULL DEFAULT '[]',
        keywords_json TEXT NOT NULL DEFAULT '[]',
        excluded_keywords_json TEXT NOT NULL DEFAULT '[]',
        seed_handles_json TEXT NOT NULL DEFAULT '[]',
        default_formats_json TEXT NOT NULL DEFAULT '["post"]',
        source_policy_json TEXT NOT NULL DEFAULT '{}',
        risk_policy_json TEXT NOT NULL DEFAULT '{}',
        scoring_policy_json TEXT NOT NULL DEFAULT '{}',
        publishing_policy_json TEXT NOT NULL DEFAULT '{}',
        ai_context TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_categories (
        account_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_primary INTEGER NOT NULL DEFAULT 0,
        weight REAL NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        publish_threshold REAL,
        daily_budget INTEGER,
        style_override_json TEXT NOT NULL DEFAULT '{}',
        ai_route_override_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY(account_id, category_id),
        FOREIGN KEY(account_id) REFERENCES accounts(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS account_categories_one_primary_idx
        ON account_categories(account_id) WHERE is_primary=1;
      CREATE TABLE IF NOT EXISTS source_categories (
        source_handle TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        monitoring_tier TEXT NOT NULL DEFAULT 'C',
        discovery_weight REAL NOT NULL DEFAULT 1,
        category_reputation REAL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_evidence_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(source_handle, category_id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
      );
      CREATE TABLE IF NOT EXISTS category_competitors (
        category_id INTEGER NOT NULL,
        competitor_id INTEGER NOT NULL,
        dominance_weight REAL NOT NULL DEFAULT 1,
        account_similarity_weight REAL NOT NULL DEFAULT 1,
        topic_weight REAL NOT NULL DEFAULT 1,
        PRIMARY KEY(category_id, competitor_id),
        FOREIGN KEY(category_id) REFERENCES categories(id),
        FOREIGN KEY(competitor_id) REFERENCES competitors(id)
      );`);
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (3, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(4)) {
    command("BEGIN;");
    try {
      seedBuiltinCategories(Math.floor(Date.now() / 1000));
      const categories = new Map((command("SELECT id, slug FROM categories;", true) as Array<{ id: number; slug: string }>).map((item) => [item.slug, item.id]));
      const accounts = command("SELECT id, style_profile_json FROM accounts;", true) as Array<{ id: number; style_profile_json: string }>;
      for (const account of accounts) {
        const profile = parseObject(account.style_profile_json);
        const raw = profile.categories;
        const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
        let primary = true;
        for (const value of values) {
          const slug = LEGACY_CATEGORY_SLUGS[value.trim().toLocaleLowerCase("tr-TR")];
          const categoryId = slug ? categories.get(slug) : undefined;
          if (!categoryId) continue;
          command(`INSERT OR IGNORE INTO account_categories (
            account_id, category_id, enabled, is_primary, weight, priority, style_override_json, ai_route_override_json
          ) VALUES (${sqlNumber(account.id)}, ${sqlNumber(categoryId)}, 1, ${sqlBool(primary)}, 1, 0, '{}', '{}');`);
          primary = false;
        }
      }
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (4, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(5)) {
    command(`CREATE TABLE IF NOT EXISTS source_reader_cursors (
      source_handle TEXT PRIMARY KEY,
      last_seen_post_id TEXT NOT NULL DEFAULT '',
      last_seen_created_at INTEGER NOT NULL DEFAULT 0,
      pagination_cursor TEXT NOT NULL DEFAULT '',
      gap_detected INTEGER NOT NULL DEFAULT 0,
      last_success_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reader_health (
      id INTEGER PRIMARY KEY,
      transport TEXT NOT NULL,
      ok INTEGER NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      checked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reader_health_transport_idx ON reader_health(transport, checked_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (5, unixepoch());");
  }
  if (!applied.has(6)) {
    command(`CREATE TABLE IF NOT EXISTS post_metric_snapshots (
      id INTEGER PRIMARY KEY,
      post_external_id TEXT NOT NULL,
      likes INTEGER,
      replies INTEGER,
      reposts INTEGER,
      quotes INTEGER,
      views INTEGER,
      followers INTEGER,
      metric_quality TEXT NOT NULL DEFAULT 'unknown',
      captured_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS post_metric_snapshots_post_idx
      ON post_metric_snapshots(post_external_id, captured_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (6, unixepoch());");
  }
  if (!applied.has(7)) {
    command(`CREATE TABLE IF NOT EXISTS cluster_metric_snapshots (
      id INTEGER PRIMARY KEY,
      cluster_id INTEGER NOT NULL,
      post_count INTEGER NOT NULL,
      likes INTEGER,
      replies INTEGER,
      reposts INTEGER,
      quotes INTEGER,
      views INTEGER,
      metric_quality TEXT NOT NULL DEFAULT 'unknown',
      captured_at INTEGER NOT NULL,
      FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id)
    );
    CREATE INDEX IF NOT EXISTS cluster_metric_snapshots_cluster_idx
      ON cluster_metric_snapshots(cluster_id, captured_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (7, unixepoch());");
  }
  if (!applied.has(8)) {
    command(`CREATE TABLE IF NOT EXISTS cluster_categories (
      cluster_id INTEGER NOT NULL, category_id INTEGER NOT NULL, confidence REAL NOT NULL DEFAULT 0,
      classified_at INTEGER NOT NULL, PRIMARY KEY(cluster_id, category_id),
      FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id), FOREIGN KEY(category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS cluster_audits (
      id INTEGER PRIMARY KEY, cluster_id INTEGER NOT NULL, action TEXT NOT NULL, from_kind TEXT NOT NULL DEFAULT '',
      to_kind TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
      FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id)
    );`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (8, unixepoch());");
  }
  if (!applied.has(9)) {
    command(`CREATE TABLE IF NOT EXISTS decision_records (
      id INTEGER PRIMARY KEY, cluster_id INTEGER, post_external_id TEXT NOT NULL, candidate_account_ids_json TEXT NOT NULL DEFAULT '[]',
      category_slugs_json TEXT NOT NULL DEFAULT '[]', score REAL NOT NULL DEFAULT 0, selected INTEGER NOT NULL DEFAULT 0,
      reason_code TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', decided_at INTEGER NOT NULL,
      FOREIGN KEY(cluster_id) REFERENCES opportunity_clusters(id)
    );
    CREATE INDEX IF NOT EXISTS decision_records_post_idx ON decision_records(post_external_id, decided_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (9, unixepoch());");
  }
  if (!applied.has(10)) {
    command("BEGIN;");
    try {
      addColumn("observed_posts", "author_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("feedback_snapshots", "publisher_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("account_metric_snapshots", "blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("competitor_profile_snapshots", "blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("competitor_posts", "author_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'");
      for (const post of command("SELECT external_id, raw_json FROM observed_posts WHERE author_blue_check_status='unknown';", true) as Array<{ external_id: string; raw_json: string }>) {
        const status = blueCheckStatusFromRawJson(post.raw_json);
        if (status !== "unknown") command(`UPDATE observed_posts SET author_blue_check_status=${sqlString(status)} WHERE external_id=${sqlString(post.external_id)};`);
      }
      for (const post of command("SELECT external_id, raw_json FROM competitor_posts WHERE author_blue_check_status='unknown';", true) as Array<{ external_id: string; raw_json: string }>) {
        const status = blueCheckStatusFromRawJson(post.raw_json);
        if (status !== "unknown") command(`UPDATE competitor_posts SET author_blue_check_status=${sqlString(status)} WHERE external_id=${sqlString(post.external_id)};`);
      }
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (10, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(11)) {
    command("BEGIN;");
    try {
      command(`CREATE TABLE IF NOT EXISTS account_subscription_events (
        id INTEGER PRIMARY KEY,
        account_id INTEGER NOT NULL,
        tier TEXT NOT NULL,
        effective_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(account_id, effective_at),
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );
      CREATE INDEX IF NOT EXISTS account_subscription_events_account_idx
        ON account_subscription_events(account_id, effective_at DESC);`);
      addColumn("observed_posts", "author_verification_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("feedback_snapshots", "publisher_verification_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("account_metric_snapshots", "verification_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("competitor_profile_snapshots", "verification_status", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("competitor_posts", "author_verification_status", "TEXT NOT NULL DEFAULT 'unknown'");
      for (const post of command("SELECT external_id, raw_json FROM observed_posts WHERE author_verification_status='unknown';", true) as Array<{ external_id: string; raw_json: string }>) {
        const status = blueCheckStatusFromRawJson(post.raw_json);
        if (status !== "unknown") command(`UPDATE observed_posts SET author_verification_status=${sqlString(status)} WHERE external_id=${sqlString(post.external_id)};`);
      }
      for (const post of command("SELECT external_id, raw_json FROM competitor_posts WHERE author_verification_status='unknown';", true) as Array<{ external_id: string; raw_json: string }>) {
        const status = blueCheckStatusFromRawJson(post.raw_json);
        if (status !== "unknown") command(`UPDATE competitor_posts SET author_verification_status=${sqlString(status)} WHERE external_id=${sqlString(post.external_id)};`);
      }
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (11, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(12)) {
    command(`CREATE TABLE IF NOT EXISTS account_subscription_state (
      account_id INTEGER PRIMARY KEY,
      tier TEXT NOT NULL DEFAULT 'unknown',
      observed_at INTEGER NOT NULL DEFAULT 0,
      history_complete INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (12, unixepoch());");
  }
  if (!applied.has(13)) {
    command(`CREATE TABLE IF NOT EXISTS monitor_targets (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      target_key TEXT NOT NULL,
      category_id INTEGER,
      source_handle TEXT NOT NULL DEFAULT '',
      query TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT '',
      lifecycle TEXT NOT NULL DEFAULT 'active',
      tier TEXT NOT NULL DEFAULT 'normal',
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      burst_until INTEGER NOT NULL DEFAULT 0,
      next_run_at INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority REAL NOT NULL DEFAULT 1,
      runs INTEGER NOT NULL DEFAULT 0,
      results INTEGER NOT NULL DEFAULT 0,
      unique_results INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,
      duplicates INTEGER NOT NULL DEFAULT 0,
      false_positives INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      lead_time_total INTEGER NOT NULL DEFAULT 0,
      last_result_at INTEGER NOT NULL DEFAULT 0,
      last_hit_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(kind, target_key),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );
    CREATE INDEX IF NOT EXISTS monitor_targets_due_idx ON monitor_targets(enabled, lifecycle, next_run_at, priority DESC);
    CREATE TABLE IF NOT EXISTS monitor_runs (
      id INTEGER PRIMARY KEY,
      target_id INTEGER,
      day_key TEXT NOT NULL,
      budget_bucket TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      requested INTEGER NOT NULL DEFAULT 1,
      returned INTEGER NOT NULL DEFAULT 0,
      unique_results INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,
      duplicates INTEGER NOT NULL DEFAULT 0,
      false_positives INTEGER NOT NULL DEFAULT 0,
      lead_time_total INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      error TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(target_id) REFERENCES monitor_targets(id)
    );
    CREATE INDEX IF NOT EXISTS monitor_runs_budget_idx ON monitor_runs(day_key, budget_bucket);
    CREATE TABLE IF NOT EXISTS monitor_observations (
      id INTEGER PRIMARY KEY,
      target_id INTEGER NOT NULL,
      post_external_id TEXT NOT NULL,
      hit INTEGER NOT NULL DEFAULT 0,
      duplicate INTEGER NOT NULL DEFAULT 0,
      false_positive INTEGER,
      lead_seconds INTEGER NOT NULL DEFAULT 0,
      observed_at INTEGER NOT NULL,
      UNIQUE(target_id, post_external_id),
      FOREIGN KEY(target_id) REFERENCES monitor_targets(id)
    );
    CREATE INDEX IF NOT EXISTS monitor_observations_target_idx ON monitor_observations(target_id, observed_at DESC);
    CREATE TABLE IF NOT EXISTS publication_intents (
      id INTEGER PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      idempotency_key TEXT NOT NULL UNIQUE,
      text TEXT NOT NULL,
      media_path TEXT NOT NULL DEFAULT '',
      media_hash TEXT NOT NULL DEFAULT '',
          receipt TEXT NOT NULL DEFAULT '',
      remote_url TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      requested_at INTEGER NOT NULL,
      approved_at INTEGER,
      dispatched_at INTEGER,
      confirmed_at INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(draft_id) REFERENCES drafts(id),
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS publication_intents_status_idx ON publication_intents(status, requested_at ASC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (13, unixepoch());");
  }
  if (!applied.has(14)) {
    addColumn("reader_health", "latency_ms", "INTEGER NOT NULL DEFAULT 0");
    addColumn("reader_health", "freshness_seconds", "INTEGER");
    addColumn("reader_health", "missing_fields_json", "TEXT NOT NULL DEFAULT '[]'");
    addColumn("reader_health", "schema_drift", "INTEGER NOT NULL DEFAULT 0");
    addColumn("publications", "draft_id", "INTEGER");
    addColumn("publications", "publication_intent_id", "INTEGER");
    command("CREATE UNIQUE INDEX IF NOT EXISTS publications_intent_idx ON publications(publication_intent_id) WHERE publication_intent_id IS NOT NULL;");
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (14, unixepoch());");
  }
  if (!applied.has(15)) {
    command(`CREATE TABLE IF NOT EXISTS draft_evaluations (
      id INTEGER PRIMARY KEY,
      draft_id INTEGER NOT NULL UNIQUE,
      account_id INTEGER,
      category_slug TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'shadow_cold_start',
      score REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      predicted_residual REAL,
      baseline_scope TEXT NOT NULL DEFAULT 'none',
      baseline_samples INTEGER NOT NULL DEFAULT 0,
      baseline_views REAL,
      baseline_likes REAL,
      baseline_replies REAL,
      baseline_reposts REAL,
      baseline_quotes REAL,
      baseline_engagement_rate REAL,
      predicted_views REAL,
      predicted_replies REAL,
      predicted_reposts REAL,
      predicted_quotes REAL,
      features_json TEXT NOT NULL DEFAULT '{}',
      semantic_json TEXT NOT NULL DEFAULT '{}',
      helped_json TEXT NOT NULL DEFAULT '[]',
      hurt_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(draft_id) REFERENCES drafts(id),
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS draft_evaluations_account_idx
      ON draft_evaluations(account_id, updated_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (15, unixepoch());");
  }
  if (!applied.has(16)) {
    command(`CREATE TABLE IF NOT EXISTS jev_scores (
      id INTEGER PRIMARY KEY,
      subject_kind TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      question_key TEXT NOT NULL DEFAULT '',
      score REAL NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'off',
      model TEXT NOT NULL DEFAULT '',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      request_hash TEXT NOT NULL DEFAULT '',
      diagnostics_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      UNIQUE(subject_kind, subject_id, question_key, request_hash)
    );
    CREATE INDEX IF NOT EXISTS jev_scores_subject_idx ON jev_scores(subject_kind, subject_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS jev_cache (
      request_hash TEXT PRIMARY KEY,
      scores_json TEXT NOT NULL DEFAULT '{}',
      reported_model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jev_cache_created_idx ON jev_cache(created_at DESC);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (16, unixepoch());");
  }
  if (!applied.has(17)) {
    // Layered opportunity score: relevance lives beside `score`, never inside score_reason,
    // because the `deterministic:` prefix in score_reason is load bearing for candidates()
    // and the market views.
    addColumn("observed_posts", "relevance_score", "REAL");
    addColumn("observed_posts", "relevance_source", "TEXT");
    addColumn("observed_posts", "relevance_json", "TEXT");
    addColumn("observed_posts", "relevance_at", "INTEGER");
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (17, unixepoch());");
  }
  if (!applied.has(18)) {
    // Multi draft selection: every generated candidate is kept, not only the winner,
    // so a later calibration can ask what the selector passed over.
    command(`CREATE TABLE IF NOT EXISTS draft_variants (
      id INTEGER PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      variant_index INTEGER NOT NULL,
      angle TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'post',
      text TEXT NOT NULL DEFAULT '',
      chosen INTEGER NOT NULL DEFAULT 0,
      evaluator_score REAL,
      jev_score REAL,
      combined_score REAL,
      selection_mode TEXT NOT NULL DEFAULT 'evaluator',
      gate_reason TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      UNIQUE(draft_id, variant_index),
      FOREIGN KEY(draft_id) REFERENCES drafts(id)
    );
    CREATE INDEX IF NOT EXISTS draft_variants_draft_idx ON draft_variants(draft_id, variant_index);`);
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (18, unixepoch());");
  }
  if (!applied.has(19)) {
    addColumn("publish_attempts", "publication_intent_id", "INTEGER REFERENCES publication_intents(id)");
    command("CREATE INDEX IF NOT EXISTS publish_attempts_intent_idx ON publish_attempts(publication_intent_id) WHERE publication_intent_id IS NOT NULL;");
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (19, unixepoch());");
  }
  if (!applied.has(20)) {
    command("BEGIN;");
    try {
      addColumn("accounts", "owner_user_id", "TEXT");
      addColumn("drafts", "owner_user_id", "TEXT");
      addColumn("draft_batches", "owner_user_id", "TEXT");
      addColumn("usage_events", "owner_user_id", "TEXT");
      command("CREATE INDEX IF NOT EXISTS accounts_owner_idx ON accounts(owner_user_id, id);");
      command("CREATE INDEX IF NOT EXISTS drafts_owner_idx ON drafts(owner_user_id, updated_at DESC);");
      command("CREATE INDEX IF NOT EXISTS draft_batches_owner_idx ON draft_batches(owner_user_id, id);");
      command("CREATE INDEX IF NOT EXISTS usage_events_owner_idx ON usage_events(owner_user_id, created_at DESC);");
      command("INSERT INTO schema_migrations (version, applied_at) VALUES (20, unixepoch());");
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(21)) {
    command("BEGIN;");
    try {
      for (const table of ["automation_jobs", "publication_intents"]) {
        addColumn(table, "attempts", "INTEGER NOT NULL DEFAULT 0");
        addColumn(table, "lease_token", "TEXT");
        addColumn(table, "lease_until", "INTEGER");
        addColumn(table, "heartbeat_at", "INTEGER");
        addColumn(table, "max_attempts", "INTEGER NOT NULL DEFAULT 5");
        addColumn(table, "next_attempt_at", "INTEGER NOT NULL DEFAULT 0");
        addColumn(table, "error_class", "TEXT NOT NULL DEFAULT ''");
        addColumn(table, "dead_lettered_at", "INTEGER");
        addColumn(table, "remote_write_started_at", "INTEGER");
      }
      command(`CREATE TABLE IF NOT EXISTS automation_job_events (
        id INTEGER PRIMARY KEY,
        job_id INTEGER NOT NULL,
        event TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '',
        error_class TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY(job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS automation_job_events_job_idx ON automation_job_events(job_id, id);
      CREATE TABLE IF NOT EXISTS publication_intent_events (
        id INTEGER PRIMARY KEY,
        intent_id INTEGER NOT NULL,
        event TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '',
        error_class TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY(intent_id) REFERENCES publication_intents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS publication_intent_events_intent_idx ON publication_intent_events(intent_id, id);
      CREATE INDEX IF NOT EXISTS automation_jobs_retry_idx ON automation_jobs(status, scheduled_at, next_attempt_at);
      CREATE INDEX IF NOT EXISTS automation_jobs_lease_idx ON automation_jobs(status, lease_until);
      CREATE INDEX IF NOT EXISTS publication_intents_lease_idx ON publication_intents(status, lease_until);
      INSERT INTO schema_migrations (version, applied_at) VALUES (21, unixepoch());`);
      command("COMMIT;");
    } catch (error) {
      command("ROLLBACK;");
      throw error;
    }
  }
  if (!applied.has(22)) {
    addColumn("publication_intents", "remote_post_id", "TEXT NOT NULL DEFAULT ''");
    command("INSERT INTO schema_migrations (version, applied_at) VALUES (22, unixepoch());");
  }
  if (!applied.has(23)) {
    command(`CREATE TABLE IF NOT EXISTS account_dispatch_leases (
      account_id INTEGER PRIMARY KEY,
      lease_token TEXT NOT NULL,
      lease_until INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS account_dispatch_leases_expiry_idx ON account_dispatch_leases(lease_until);
    INSERT INTO schema_migrations (version, applied_at) VALUES (23, unixepoch());`);
  }
  if (!applied.has(24)) {
    command("BEGIN IMMEDIATE;");
    try {
      command(`CREATE TABLE IF NOT EXISTS legacy_transport_evidence (
        entity TEXT NOT NULL, entity_id INTEGER NOT NULL, metadata_json TEXT NOT NULL,
        archived_at INTEGER NOT NULL, PRIMARY KEY(entity, entity_id)
      );`);
      for (const [table, legacyColumns] of Object.entries(legacyTransportSchema.columns)) {
        const columns = new Set((command(`PRAGMA table_info(${table});`, true) as Array<{ name: string }>).map(row => row.name));
        const present = legacyColumns.filter(column => columns.has(column));
        if (!present.length) continue;
        const fields = present.map(column => `${sqlString(column)}, ${column}`).join(",");
        const nonempty = present.map(column => `CAST(${column} AS TEXT) NOT IN ('','0')`).join(" OR ");
        command(`INSERT OR IGNORE INTO legacy_transport_evidence(entity,entity_id,metadata_json,archived_at)
          SELECT ${sqlString(table)},id,json_object(${fields}),unixepoch() FROM ${table} WHERE ${nonempty};`);
        for (const column of present) command(`ALTER TABLE ${table} DROP COLUMN ${column};`);
      }
      command(`UPDATE publication_intents SET status='reconciliation_required',reason='Historical transport receipt needs manual verification'
        WHERE status=${sqlString(legacyTransportSchema.intentStatus)};
        INSERT INTO schema_migrations(version,applied_at) VALUES(24,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(25)) {
    command("BEGIN IMMEDIATE;");
    try {
      command(`CREATE TABLE IF NOT EXISTS publication_approval_snapshots (
        id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL CHECK(entity_type IN ('publication_intent','automation_job')),
        entity_id INTEGER NOT NULL, draft_id INTEGER NOT NULL, draft_revision INTEGER NOT NULL, text TEXT NOT NULL, account_id INTEGER,
        action TEXT NOT NULL, format TEXT NOT NULL, target_id TEXT NOT NULL DEFAULT '', external_id TEXT NOT NULL DEFAULT '',
        source_handle TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', media_hash TEXT NOT NULL DEFAULT '',
        approval_source TEXT NOT NULL CHECK(approval_source IN ('human','automatic')), approved_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, UNIQUE(entity_type,entity_id)
      );
      CREATE TRIGGER IF NOT EXISTS publication_approval_snapshots_no_update BEFORE UPDATE ON publication_approval_snapshots
        BEGIN SELECT RAISE(ABORT, 'approval snapshots are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS publication_approval_snapshots_no_delete BEFORE DELETE ON publication_approval_snapshots
        BEGIN SELECT RAISE(ABORT, 'approval snapshots are immutable'); END;`);
      addColumn("publication_intents", "approval_expires_at", "INTEGER");
      addColumn("publication_intents", "approval_snapshot_id", "INTEGER");
      addColumn("automation_jobs", "approval_expires_at", "INTEGER");
      addColumn("automation_jobs", "approval_snapshot_id", "INTEGER");
      command(`UPDATE publication_intents SET status='expired',reason='legacy_approval_requires_renewal',updated_at=unixepoch()
        WHERE status='approved' AND remote_write_started_at IS NULL;
        UPDATE automation_jobs SET status='expired',reason='legacy_approval_requires_renewal',updated_at=unixepoch()
        WHERE status IN ('queued','scheduled') AND remote_write_started_at IS NULL;
        INSERT INTO schema_migrations(version,applied_at) VALUES(25,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(26)) {
    command("BEGIN IMMEDIATE;");
    try {
      addColumn("account_categories", "source", "TEXT NOT NULL DEFAULT 'manual'");
      addColumn("account_categories", "user_modified_at", "INTEGER");
      command(`CREATE TABLE IF NOT EXISTS account_category_inference_jobs (
        id INTEGER PRIMARY KEY, owner_user_id TEXT NOT NULL, account_id INTEGER NOT NULL, version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running','ready','insufficient_evidence','failed')),
        result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(owner_user_id,account_id,version), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account_category_inferences (
        id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, owner_user_id TEXT NOT NULL, account_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL, confidence REAL NOT NULL, evidence_json TEXT NOT NULL,
        model_id TEXT NOT NULL DEFAULT 'deterministic-keyword-v1', prompt_version TEXT NOT NULL DEFAULT 'none',
        inference_version INTEGER NOT NULL, suggested_at INTEGER NOT NULL, accepted_at INTEGER, rejected_at INTEGER,
        UNIQUE(job_id,category_id), FOREIGN KEY(job_id) REFERENCES account_category_inference_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES categories(id)
      );
      CREATE INDEX IF NOT EXISTS account_category_inferences_owner_idx ON account_category_inferences(owner_user_id,account_id,job_id);
      INSERT INTO schema_migrations(version,applied_at) VALUES(26,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  // P4 public identity is deliberately separate from connected X accounts, drafts and analytics.
  if (!applied.has(27)) {
    command("BEGIN IMMEDIATE;");
    try {
      command(`CREATE TABLE IF NOT EXISTS user_profiles (
        owner_user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS user_profiles_public_username_idx ON user_profiles(username,visibility);
      INSERT INTO schema_migrations(version,applied_at) VALUES(27,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(28)) {
    command("BEGIN IMMEDIATE;");
    try {
      command(`CREATE TABLE IF NOT EXISTS hit_shares (
        id INTEGER PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        prediction_id TEXT NOT NULL,
        remote_post_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS hit_shares_owner_idx ON hit_shares(owner_user_id,created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS hit_shares_active_post_idx ON hit_shares(owner_user_id,remote_post_id) WHERE revoked_at IS NULL;
      INSERT INTO schema_migrations(version,applied_at) VALUES(28,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(31)) {
    command("BEGIN IMMEDIATE;");
    try {
      addColumn("hit_shares", "leaderboard_opt_in", "INTEGER NOT NULL DEFAULT 0 CHECK(leaderboard_opt_in IN (0,1))");
      command(`CREATE TABLE IF NOT EXISTS hit_evidence_exclusions (
        owner_user_id TEXT NOT NULL, account_id INTEGER NOT NULL, remote_post_id TEXT NOT NULL,
        reason TEXT NOT NULL, flagged_at INTEGER NOT NULL,
        PRIMARY KEY(owner_user_id,account_id,remote_post_id),
        FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      INSERT INTO schema_migrations(version,applied_at) VALUES(31,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(30)) {
    command("BEGIN IMMEDIATE;");
    try {
      addColumn("usage_events", "owner_user_id", "TEXT");
      addColumn("usage_events", "estimated_cost_usd", "REAL");
      addColumn("usage_events", "reported_cost_usd", "REAL");
      addColumn("usage_events", "cost_basis", "TEXT NOT NULL DEFAULT 'unknown'");
      addColumn("usage_events", "input_tokens", "INTEGER");
      addColumn("usage_events", "output_tokens", "INTEGER");
      addColumn("usage_events", "reservation_id", "TEXT");
      command(`UPDATE usage_events SET estimated_cost_usd=estimated_usd,cost_basis='estimated' WHERE provider<>'compatible' AND cost_basis='unknown';
        UPDATE usage_events SET cost_basis='unknown',estimated_cost_usd=NULL WHERE provider='compatible' AND cost_basis='unknown';
        CREATE TABLE IF NOT EXISTS ai_budget_reservations (
          id TEXT PRIMARY KEY, owner_user_id TEXT, task TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
          reserved_usd REAL, status TEXT NOT NULL CHECK(status IN ('pending','settled','released','ambiguous')),
          created_at INTEGER NOT NULL, settled_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS ai_budget_reservations_owner_status_idx ON ai_budget_reservations(owner_user_id,status,created_at);
        CREATE INDEX IF NOT EXISTS usage_events_owner_idx ON usage_events(owner_user_id,created_at DESC);
        INSERT INTO schema_migrations(version,applied_at) VALUES(30,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(32)) {
    command("BEGIN IMMEDIATE;");
    try {
      addColumn("user_profiles", "x_handle", "TEXT");
      addColumn("user_profiles", "avatar_url", "TEXT");
      addColumn("user_profiles", "onboarding_completed", "INTEGER NOT NULL DEFAULT 1");
      // Existing visibility choices remain authoritative; new profiles choose during onboarding.
      command(`CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_x_handle_ci_idx ON user_profiles(lower(x_handle)) WHERE x_handle IS NOT NULL;
        CREATE TABLE IF NOT EXISTS user_profile_x_identity (
          owner_user_id TEXT PRIMARY KEY,
          x_user_id TEXT NOT NULL UNIQUE,
          FOREIGN KEY(owner_user_id) REFERENCES user_profiles(owner_user_id) ON DELETE CASCADE
        );
        INSERT INTO schema_migrations(version,applied_at) VALUES(32,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(33)) {
    command("BEGIN IMMEDIATE;");
    try {
      command(`CREATE TABLE IF NOT EXISTS account_sources (
        account_id INTEGER NOT NULL, source_handle TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        max_posts INTEGER NOT NULL DEFAULT 20, rights_status TEXT NOT NULL DEFAULT 'unknown', name_override TEXT NOT NULL DEFAULT '',
        niche TEXT NOT NULL DEFAULT '', topics_json TEXT NOT NULL DEFAULT '[]', tone TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(account_id, source_handle), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY(source_handle) REFERENCES sources(handle) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account_source_categories (
        account_id INTEGER NOT NULL, source_handle TEXT NOT NULL, category_id INTEGER NOT NULL,
        monitoring_tier TEXT NOT NULL DEFAULT 'C', discovery_weight REAL NOT NULL DEFAULT 1,
        category_reputation REAL, enabled INTEGER NOT NULL DEFAULT 1, last_evidence_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(account_id, source_handle, category_id),
        FOREIGN KEY(account_id, source_handle) REFERENCES account_sources(account_id, source_handle) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS account_source_categories_lookup_idx ON account_source_categories(account_id, source_handle, enabled);
      INSERT INTO schema_migrations(version,applied_at) VALUES(33,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
  if (!applied.has(34)) {
    command("BEGIN IMMEDIATE;");
    try {
      addColumn("categories", "owner_user_id", "TEXT");
      addColumn("categories", "account_id", "INTEGER");
      command(`CREATE INDEX IF NOT EXISTS categories_owner_account_idx ON categories(owner_user_id,account_id);
        CREATE TRIGGER IF NOT EXISTS delete_account_scoped_categories AFTER DELETE ON accounts
        BEGIN DELETE FROM categories WHERE account_id=OLD.id AND owner_user_id=OLD.owner_user_id; END;
        INSERT INTO schema_migrations(version,applied_at) VALUES(34,unixepoch());`);
      command("COMMIT;");
    } catch (error) { command("ROLLBACK;"); throw error; }
  }
}

export function ensureDatabase(path?: string): boolean {
  if (initialized) return !path || path === DATABASE_PATH;
  if (initializationError) return false;

  try {
    if (path) DATABASE_PATH = path;
    mkdirSync(dirname(/* turbopackIgnore: true */ DATABASE_PATH), { recursive: true });
    database = new DatabaseSync(DATABASE_PATH);
    command("PRAGMA foreign_keys=ON;");
    command("PRAGMA journal_mode=WAL;");
    command("PRAGMA busy_timeout=5000;");
    command(schema);
    applyMigrations();
    seedBuiltinCategories(Math.floor(Date.now() / 1000));
    for (const [table, column, definition] of [
      ["drafts", "batch_id", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "origin", "TEXT NOT NULL DEFAULT 'manual'"],
      ["drafts", "prompt", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "provider", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "model", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "variant_mode", "TEXT NOT NULL DEFAULT 'same_text'"],
      ["drafts", "source_handle", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "source_url", "TEXT NOT NULL DEFAULT ''"],
      ["drafts", "source_score", "REAL NOT NULL DEFAULT 0"],
      ["automation_jobs", "remote_url", "TEXT NOT NULL DEFAULT ''"],
      ["automation_jobs", "reconciliation_status", "TEXT NOT NULL DEFAULT 'not_started'"],
      ["publish_attempts", "account_id", "INTEGER"],
      ["publish_attempts", "updated_at", "INTEGER NOT NULL DEFAULT 0"],
      ["publish_attempts", "occurrences", "INTEGER NOT NULL DEFAULT 1"],
      ["observed_posts", "author_followers", "INTEGER NOT NULL DEFAULT 0"],
      ["feedback_snapshots", "milestone", "TEXT NOT NULL DEFAULT 'legacy'"],
      ["feedback_snapshots", "poll_votes", "INTEGER NOT NULL DEFAULT 0"],
      ["observed_posts", "author_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["feedback_snapshots", "publisher_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["account_metric_snapshots", "blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["competitor_profile_snapshots", "blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["competitor_posts", "author_blue_check_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["observed_posts", "author_verification_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["feedback_snapshots", "publisher_verification_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["account_metric_snapshots", "verification_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["competitor_profile_snapshots", "verification_status", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["competitor_posts", "author_verification_status", "TEXT NOT NULL DEFAULT 'unknown'"],
    ] as const) {
      addColumn(table, column, definition);
    }
    command("CREATE INDEX IF NOT EXISTS feedback_snapshots_post_milestone_idx ON feedback_snapshots(post_external_id, milestone, captured_at DESC);");
    command("UPDATE publish_attempts SET updated_at=created_at WHERE updated_at=0;");
    command(`BEGIN;
      UPDATE publish_attempts SET
        occurrences=(SELECT SUM(other.occurrences) FROM publish_attempts AS other
          WHERE other.status='blocked' AND other.post_external_id=publish_attempts.post_external_id
            AND COALESCE(other.account_id, 0)=COALESCE(publish_attempts.account_id, 0)),
        updated_at=(SELECT MAX(other.updated_at) FROM publish_attempts AS other
          WHERE other.status='blocked' AND other.post_external_id=publish_attempts.post_external_id
            AND COALESCE(other.account_id, 0)=COALESCE(publish_attempts.account_id, 0))
        WHERE status='blocked' AND id IN (SELECT MAX(id) FROM publish_attempts WHERE status='blocked' GROUP BY post_external_id, COALESCE(account_id, 0));
      DELETE FROM publish_attempts WHERE status='blocked' AND id NOT IN (
        SELECT MAX(id) FROM publish_attempts WHERE status='blocked' GROUP BY post_external_id, COALESCE(account_id, 0)
      );
      COMMIT;`);
    command("UPDATE accounts SET daily_limit=24 WHERE daily_limit=6;");
    const scoreVersion = (command("SELECT value FROM app_settings WHERE name='post_score_version' LIMIT 1;", true) as Array<{ value?: string }>)[0]?.value;
    if (scoreVersion !== SCORE_VERSION) {
      recalculateRecentScoresInternal(Math.floor(Date.now() / 1000));
      command(`INSERT INTO app_settings (name, value, updated_at) VALUES ('post_score_version', ${sqlString(SCORE_VERSION)}, ${sqlNumber(Math.floor(Date.now() / 1000))})
        ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`);
    }
    initialized = true;
    return true;
  } catch (error) {
    initializationError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

export function claimAccountDispatchLease(input: { accountId: number; now: number; leaseSeconds?: number }): AccountDispatchLease | null {
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !Number.isFinite(input.now)) throw new Error("account dispatch lease input is invalid");
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const leaseToken = randomUUID();
  command("BEGIN IMMEDIATE;");
  try {
    requireOwnedAccount(input.accountId);
    const lease = criticalRows<{ account_id: number; lease_token: string; lease_until: number }>(`INSERT INTO account_dispatch_leases(account_id,lease_token,lease_until,created_at,updated_at)
      VALUES (${sqlNumber(input.accountId)},${sqlString(leaseToken)},${sqlNumber(input.now + leaseSeconds)},${sqlNumber(input.now)},${sqlNumber(input.now)})
      ON CONFLICT(account_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,updated_at=excluded.updated_at
        WHERE account_dispatch_leases.lease_until<=${sqlNumber(input.now)}
      RETURNING account_id,lease_token,lease_until;`)[0];
    command("COMMIT;");
    return lease ? { accountId: lease.account_id, leaseToken: lease.lease_token, leaseUntil: lease.lease_until } : null;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function renewAccountDispatchLease(input: { accountId: number; leaseToken: string; now: number; leaseSeconds?: number }): boolean {
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !input.leaseToken || !Number.isFinite(input.now)) return false;
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const ownerClause = ownerSql("accounts.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const renewed = criticalRows<{ account_id: number }>(`UPDATE account_dispatch_leases SET lease_until=${sqlNumber(input.now + leaseSeconds)},updated_at=${sqlNumber(input.now)}
      WHERE account_id=${sqlNumber(input.accountId)} AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)}
        AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id=account_dispatch_leases.account_id ${ownerClause ? `AND ${ownerClause}` : ""}) RETURNING account_id;`);
    command("COMMIT;");
    return renewed.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

/** Invalidate, but retain, the lease row as a tombstone so old tokenless workers stay fenced. */
export function releaseAccountDispatchLease(input: { accountId: number; leaseToken: string; now: number }): boolean {
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !input.leaseToken || !Number.isFinite(input.now)) return false;
  const ownerClause = ownerSql("accounts.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const released = criticalRows<{ account_id: number }>(`UPDATE account_dispatch_leases SET lease_token=${sqlString(randomUUID())},lease_until=${sqlNumber(input.now)},updated_at=${sqlNumber(input.now)}
      WHERE account_id=${sqlNumber(input.accountId)} AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)}
        AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id=account_dispatch_leases.account_id ${ownerClause ? `AND ${ownerClause}` : ""}) RETURNING account_id;`);
    command("COMMIT;");
    return released.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function isAccountDispatchLeaseCurrent(input: { accountId: number; leaseToken: string; now: number }): boolean {
  if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !input.leaseToken || !Number.isFinite(input.now)) return false;
  const ownerClause = ownerSql("accounts.owner_user_id");
  return criticalRows<{ account_id: number }>(`SELECT lease.account_id FROM account_dispatch_leases lease JOIN accounts ON accounts.id=lease.account_id
    WHERE lease.account_id=${sqlNumber(input.accountId)} AND lease.lease_token=${sqlString(input.leaseToken)} AND lease.lease_until>${sqlNumber(input.now)}
      ${ownerClause ? `AND ${ownerClause}` : ""} LIMIT 1;`).length > 0;
}

function rows<T>(sql: string): T[] {
  if (!ensureDatabase()) return [];
  try {
    return (command(sql, true) as Record<string, unknown>[]).map((row) => ({ ...row }) as T);
  } catch {
    return [];
  }
}

type ScoreRecalculationRow = {
  external_id: string; created_timestamp: number; likes: number; replies: number; reposts: number; quotes: number;
  views: number; author_followers: number; media_count: number; sensitive: number;
};

function recalculateRecentScoresInternal(now: number): number {
  const posts = command(`SELECT external_id, created_timestamp, likes, replies, reposts, quotes, views, author_followers, media_count, sensitive
    FROM observed_posts WHERE observed_at >= ${sqlNumber(now - OPPORTUNITY_MAX_AGE_SECONDS)};`, true) as ScoreRecalculationRow[];
  if (!posts.length) return 0;
  command("BEGIN IMMEDIATE;");
  try {
    for (const post of posts) {
      const score = scorePost({
        likes: post.likes, replies: post.replies, reposts: post.reposts, quotes: post.quotes, views: post.views,
        followers: post.author_followers, createdTimestamp: post.created_timestamp, mediaCount: post.media_count,
        sensitive: post.sensitive === 1, now,
      });
      command(`UPDATE observed_posts SET score=${sqlNumber(score.score)}, score_reason=${sqlString(score.reason)} WHERE external_id=${sqlString(post.external_id)};`);
    }
    command("COMMIT;");
    return posts.length;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function recalculateRecentScores(now = Math.floor(Date.now() / 1000)): number {
  if (!ensureDatabase()) return 0;
  return recalculateRecentScoresInternal(now);
}

function criticalRows<T>(sql: string): T[] {
  if (!ensureDatabase()) throw new Error(initializationError || "database unavailable");
  return command(sql, true) as T[];
}

function exec(sql: string): void {
  if (!ensureDatabase()) throw new Error(initializationError || "database unavailable");
  command(sql);
}

export function upsertSource(source: SourceConfig, now: number): void {
  exec(`
    INSERT INTO sources (handle, name, enabled, max_posts, rights_status, profile_json, updated_at)
    VALUES (${sqlString(source.handle)}, ${sqlString(source.name)}, ${sqlBool(source.enabled)},
      ${sqlNumber(source.maxPosts)}, ${sqlString(source.rightsStatus)},
      ${sqlString(JSON.stringify(source.profile))}, ${sqlNumber(now)})
    ON CONFLICT(handle) DO UPDATE SET
      name=excluded.name,
      enabled=excluded.enabled,
      max_posts=excluded.max_posts,
      rights_status=excluded.rights_status,
      profile_json=excluded.profile_json,
      updated_at=excluded.updated_at;
  `);
}

export type SourceReaderCursor = {
  sourceHandle: string;
  lastSeenPostId: string;
  lastSeenCreatedAt: number;
  paginationCursor: string;
  gapDetected: boolean;
  lastSuccessAt: number;
};

export function recordSourceReaderCursor(input: SourceReaderCursor): void {
  exec(`INSERT INTO source_reader_cursors (
      source_handle, last_seen_post_id, last_seen_created_at, pagination_cursor, gap_detected, last_success_at
    ) VALUES (
      ${sqlString(input.sourceHandle)}, ${sqlString(input.lastSeenPostId)}, ${sqlNumber(input.lastSeenCreatedAt)},
      ${sqlString(input.paginationCursor)}, ${sqlBool(input.gapDetected)}, ${sqlNumber(input.lastSuccessAt)}
    ) ON CONFLICT(source_handle) DO UPDATE SET
      last_seen_post_id=excluded.last_seen_post_id,
      last_seen_created_at=excluded.last_seen_created_at,
      pagination_cursor=excluded.pagination_cursor,
      gap_detected=excluded.gap_detected,
      last_success_at=excluded.last_success_at;`);
}

export function getSourceReaderCursor(sourceHandle: string): SourceReaderCursor | null {
  const cursor = rows<{ source_handle: string; last_seen_post_id: string; last_seen_created_at: number; pagination_cursor: string; gap_detected: number; last_success_at: number }>(`SELECT source_handle, last_seen_post_id, last_seen_created_at, pagination_cursor, gap_detected, last_success_at
    FROM source_reader_cursors WHERE source_handle=${sqlString(sourceHandle)} LIMIT 1;`)[0];
  return cursor ? {
    sourceHandle: cursor.source_handle,
    lastSeenPostId: cursor.last_seen_post_id,
    lastSeenCreatedAt: cursor.last_seen_created_at,
    paginationCursor: cursor.pagination_cursor,
    gapDetected: cursor.gap_detected === 1,
    lastSuccessAt: cursor.last_success_at,
  } : null;
}

export function recordReaderHealth(input: { transport: string; ok: boolean; error?: string; checkedAt: number; latencyMs?: number; freshnessSeconds?: number | null; missingFields?: string[]; schemaDrift?: boolean }): void {
  exec(`INSERT INTO reader_health (transport, ok, error, checked_at, latency_ms, freshness_seconds, missing_fields_json, schema_drift) VALUES (
    ${sqlString(input.transport)}, ${sqlBool(input.ok)}, ${sqlString(input.error || "")}, ${sqlNumber(input.checkedAt)},
    ${sqlNumber(input.latencyMs || 0)}, ${input.freshnessSeconds === null || input.freshnessSeconds === undefined ? "NULL" : sqlNumber(input.freshnessSeconds)},
    ${sqlString(JSON.stringify(input.missingFields || []))}, ${sqlBool(input.schemaDrift === true)}
  );`);
}

export function readerPublishingReady(now: number, maxAgeSeconds = 10 * 60): boolean {
  const health = criticalRows<{ ok: number; checked_at: number }>(`SELECT ok, checked_at FROM reader_health ORDER BY id DESC LIMIT 1;`)[0];
  if (!health || health.ok !== 1 || now - health.checked_at > maxAgeSeconds) return false;
  return criticalRows<{ count: number }>(`SELECT COUNT(*) AS count FROM source_reader_cursors WHERE gap_detected=1;`)[0]?.count === 0;
}

export function getReaderHealth(limit = 20) {
  return rows<{ id: number; transport: string; ok: number; error: string; checked_at: number; latency_ms: number; freshness_seconds: number | null; missing_fields_json: string; schema_drift: number }>(`SELECT id, transport, ok, error, checked_at, latency_ms, freshness_seconds, missing_fields_json, schema_drift
    FROM reader_health ORDER BY checked_at DESC, id DESC LIMIT ${sqlNumber(Math.max(1, Math.min(100, limit)))};`).map((item) => ({
    id: item.id, transport: item.transport, ok: item.ok === 1, error: item.error, checkedAt: item.checked_at,
    latencyMs: item.latency_ms, freshnessSeconds: item.freshness_seconds, missingFields: parseArray(item.missing_fields_json), schemaDrift: item.schema_drift === 1,
  }));
}

type MonitorTargetRow = {
  id: number; kind: MonitorKind; target_key: string; category_id: number | null; source_handle: string; query: string;
  conversation_id: string; lifecycle: MonitorTarget["lifecycle"]; tier: MonitorTier; interval_seconds: number;
  burst_until: number; next_run_at: number; enabled: number; priority: number; runs: number; results: number;
  unique_results: number; hits: number; duplicates: number; false_positives: number; reviewed: number;
  lead_time_total: number; last_result_at: number; last_hit_at: number; created_at: number; updated_at: number;
};

function monitorTarget(row: MonitorTargetRow): MonitorTarget {
  return {
    id: row.id, kind: row.kind, key: row.target_key, categoryId: row.category_id, sourceHandle: row.source_handle,
    query: row.query, conversationId: row.conversation_id, lifecycle: row.lifecycle, tier: row.tier,
    intervalSeconds: row.interval_seconds, burstUntil: row.burst_until, nextRunAt: row.next_run_at,
    enabled: row.enabled === 1, priority: row.priority, runs: row.runs, results: row.results,
    uniqueResults: row.unique_results, hits: row.hits, duplicates: row.duplicates,
    falsePositives: row.false_positives, reviewed: row.reviewed, leadTimeTotal: row.lead_time_total,
    lastResultAt: row.last_result_at, lastHitAt: row.last_hit_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function upsertMonitorTarget(input: {
  kind: MonitorKind; key: string; categoryId?: number | null; sourceHandle?: string; query?: string; conversationId?: string;
  lifecycle?: MonitorTarget["lifecycle"]; tier?: MonitorTier; intervalSeconds?: number; priority?: number; enabled?: boolean; now: number;
}): MonitorTarget {
  if (!MONITOR_KINDS.includes(input.kind)) throw new Error("monitor kind geçersiz");
  const key = input.key.trim().slice(0, 500);
  if (!key) throw new Error("monitor key gerekli");
  const interval = Math.max(15, Math.min(86400, Math.round(input.intervalSeconds || 300)));
  exec(`INSERT INTO monitor_targets (
      kind, target_key, category_id, source_handle, query, conversation_id, lifecycle, tier,
      interval_seconds, next_run_at, enabled, priority, created_at, updated_at
    ) VALUES (
      ${sqlString(input.kind)}, ${sqlString(key)}, ${input.categoryId ? sqlNumber(input.categoryId) : "NULL"},
      ${sqlString((input.sourceHandle || "").slice(0, 15))}, ${sqlString((input.query || "").slice(0, 500))},
      ${sqlString((input.conversationId || "").slice(0, 32))}, ${sqlString(input.lifecycle || "active")},
      ${sqlString(input.tier || "normal")}, ${sqlNumber(interval)}, ${sqlNumber(input.now)}, ${sqlBool(input.enabled !== false)},
      ${Number.isFinite(input.priority) ? input.priority : 1}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
    ) ON CONFLICT(kind, target_key) DO UPDATE SET
      category_id=COALESCE(excluded.category_id, monitor_targets.category_id), source_handle=excluded.source_handle,
      query=excluded.query, conversation_id=excluded.conversation_id,
      enabled=CASE WHEN monitor_targets.lifecycle='retired' THEN monitor_targets.enabled ELSE excluded.enabled END,
      priority=excluded.priority, updated_at=excluded.updated_at;`);
  const row = rows<MonitorTargetRow>(`SELECT * FROM monitor_targets WHERE kind=${sqlString(input.kind)} AND target_key=${sqlString(key)} LIMIT 1;`)[0];
  if (!row) throw new Error("monitor target kaydedilemedi");
  return monitorTarget(row);
}

export function getMonitorTargets(input: { kind?: MonitorKind; lifecycle?: MonitorTarget["lifecycle"]; dueAt?: number; limit?: number } = {}): MonitorTarget[] {
  const filters = [input.kind ? `kind=${sqlString(input.kind)}` : "", input.lifecycle ? `lifecycle=${sqlString(input.lifecycle)}` : "", input.dueAt !== undefined ? `enabled=1 AND lifecycle<>'retired' AND next_run_at<=${sqlNumber(input.dueAt)}` : ""].filter(Boolean);
  return rows<MonitorTargetRow>(`SELECT * FROM monitor_targets ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY next_run_at ASC, priority DESC, id ASC LIMIT ${sqlNumber(Math.max(1, Math.min(2000, input.limit || 200)))};`).map(monitorTarget);
}

export function claimMonitorRun(input: { targetId: number | null; dayKey: string; bucket: MonitorBucket; now: number; dailyBudget?: number }): number | null {
  const budget = Math.max(1, Math.min(100_000, input.dailyBudget || 10_000));
  command("BEGIN IMMEDIATE;");
  try {
    const used = criticalRows<{ used: number }>(`SELECT COALESCE(SUM(requested), 0) AS used FROM monitor_runs WHERE day_key=${sqlString(input.dayKey)};`)[0]?.used || 0;
    if (used >= budget) {
      command("ROLLBACK;");
      return null;
    }
    command(`INSERT INTO monitor_runs (target_id, day_key, budget_bucket, status, requested, started_at)
      VALUES (${input.targetId ? sqlNumber(input.targetId) : "NULL"}, ${sqlString(input.dayKey)}, ${sqlString(input.bucket)}, 'running', 1, ${sqlNumber(input.now)});`);
    const id = criticalRows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0]?.id || 0;
    command("COMMIT;");
    return id || null;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function getMonitorBudgetUsage(dayKey: string): Record<MonitorBucket | "total", number> {
  const result = { proven_alpha: 0, hot_categories: 0, discovery: 0, challengers: 0, reconciliation: 0, exploration: 0, total: 0 };
  for (const row of rows<{ budget_bucket: MonitorBucket; used: number }>(`SELECT budget_bucket, COALESCE(SUM(requested), 0) AS used FROM monitor_runs WHERE day_key=${sqlString(dayKey)} GROUP BY budget_bucket;`)) {
    if (row.budget_bucket in result) result[row.budget_bucket] = row.used;
    result.total += row.used;
  }
  return result;
}

export function finishMonitorRun(input: {
  runId: number; targetId: number; status: "success" | "partial" | "failed"; returned: number; uniqueResults: number;
  hits: number; duplicates: number; falsePositives?: number; leadTimeTotal?: number; intervalSeconds: number;
  tier: MonitorTier; burstUntil?: number; error?: string; now: number;
}): void {
  exec(`UPDATE monitor_runs SET status=${sqlString(input.status)}, returned=${sqlNumber(input.returned)}, unique_results=${sqlNumber(input.uniqueResults)},
      hits=${sqlNumber(input.hits)}, duplicates=${sqlNumber(input.duplicates)}, false_positives=${sqlNumber(input.falsePositives || 0)},
      lead_time_total=${sqlNumber(input.leadTimeTotal || 0)}, finished_at=${sqlNumber(input.now)}, error=${sqlString((input.error || "").slice(0, 2000))}
    WHERE id=${sqlNumber(input.runId)};
    UPDATE monitor_targets SET runs=runs+1, results=results+${sqlNumber(input.returned)}, unique_results=unique_results+${sqlNumber(input.uniqueResults)},
      hits=hits+${sqlNumber(input.hits)}, duplicates=duplicates+${sqlNumber(input.duplicates)},
      false_positives=false_positives+${sqlNumber(input.falsePositives || 0)}, lead_time_total=lead_time_total+${sqlNumber(input.leadTimeTotal || 0)},
      tier=${sqlString(input.tier)}, interval_seconds=${sqlNumber(input.intervalSeconds)}, burst_until=${sqlNumber(input.burstUntil || 0)},
      next_run_at=${sqlNumber(input.now + input.intervalSeconds)},
      last_result_at=CASE WHEN ${sqlNumber(input.uniqueResults)}>0 THEN ${sqlNumber(input.now)} ELSE last_result_at END,
      last_hit_at=CASE WHEN ${sqlNumber(input.hits)}>0 THEN ${sqlNumber(input.now)} ELSE last_hit_at END,
      updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.targetId)};`);
}

export function finishBudgetRun(runId: number, status: "success" | "failed", now: number, error = ""): void {
  exec(`UPDATE monitor_runs SET status=${sqlString(status)}, finished_at=${sqlNumber(now)}, error=${sqlString(error.slice(0, 2000))}
    WHERE id=${sqlNumber(runId)};`);
}

export function recordMonitorObservation(input: { targetId: number; externalId: string; hit: boolean; duplicate: boolean; leadSeconds: number; now: number }): boolean {
  const existing = rows<{ id: number }>(`SELECT id FROM monitor_observations WHERE target_id=${sqlNumber(input.targetId)} AND post_external_id=${sqlString(input.externalId)} LIMIT 1;`)[0];
  if (existing) return false;
  exec(`INSERT INTO monitor_observations (target_id, post_external_id, hit, duplicate, lead_seconds, observed_at)
    VALUES (${sqlNumber(input.targetId)}, ${sqlString(input.externalId)}, ${sqlBool(input.hit)}, ${sqlBool(input.duplicate)}, ${sqlNumber(input.leadSeconds)}, ${sqlNumber(input.now)});`);
  return true;
}

export function reviewMonitorObservation(input: { targetId: number; externalId: string; falsePositive: boolean; now: number }): boolean {
  const current = rows<{ false_positive: number | null }>(`SELECT false_positive FROM monitor_observations WHERE target_id=${sqlNumber(input.targetId)} AND post_external_id=${sqlString(input.externalId)} LIMIT 1;`)[0];
  if (!current) return false;
  const firstReview = current.false_positive === null;
  exec(`UPDATE monitor_observations SET false_positive=${sqlBool(input.falsePositive)} WHERE target_id=${sqlNumber(input.targetId)} AND post_external_id=${sqlString(input.externalId)};
    UPDATE monitor_targets SET reviewed=reviewed+${firstReview ? 1 : 0}, false_positives=false_positives+${input.falsePositive && current.false_positive !== 1 ? 1 : !input.falsePositive && current.false_positive === 1 ? -1 : 0}, updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.targetId)};`);
  return true;
}

export function updateMonitorLifecycle(id: number, lifecycle: MonitorTarget["lifecycle"], now: number): void {
  exec(`UPDATE monitor_targets SET lifecycle=${sqlString(lifecycle)}, enabled=${sqlBool(lifecycle !== "retired")}, updated_at=${sqlNumber(now)} WHERE id=${sqlNumber(id)};`);
}

export function getMonitoringPerformance(limit = 200) {
  return getMonitorTargets({ limit: 2000 }).map((target) => ({
    ...target,
    hitYield: target.uniqueResults ? target.hits / target.uniqueResults : null,
    duplicateRate: target.results ? target.duplicates / target.results : null,
    falsePositiveRate: target.reviewed ? target.falsePositives / target.reviewed : null,
    medianLeadSeconds: target.hits ? Math.round(target.leadTimeTotal / target.hits) : null,
  })).sort((left, right) => right.runs - left.runs || right.lastResultAt - left.lastResultAt || left.id - right.id).slice(0, Math.max(1, Math.min(2000, limit)));
}

export function getSourceRights(handle: string): SourceConfig["rightsStatus"] {
  const result = rows<{ rights_status: string }>(
    `SELECT rights_status FROM sources WHERE handle=${sqlString(handle)} LIMIT 1;`,
  )[0]?.rights_status;
  return result === "cleared" || result === "prohibited" ? result : "unknown";
}

export function upsertPost(post: ObservedPost, now: number): boolean {
  const existing = rows<{ external_id: string }>(
    `SELECT external_id FROM observed_posts WHERE external_id=${sqlString(post.externalId)} LIMIT 1;`,
  ).length > 0;

  exec(`
    INSERT INTO observed_posts (
      external_id, source_handle, author_handle, status_url, text, created_timestamp,
      likes, replies, reposts, quotes, views, author_followers, author_blue_check_status, author_verification_status, media_count, media_json, raw_json,
      score, score_reason, sensitive, cluster_key, observed_at, first_seen_at, last_seen_at,
      last_metrics_at, reader_received_at
    ) VALUES (
      ${sqlString(post.externalId)}, ${sqlString(post.sourceHandle)}, ${sqlString(post.authorHandle)},
      ${sqlString(post.statusUrl)}, ${sqlString(post.text)}, ${sqlNumber(post.createdTimestamp)},
      ${sqlNumber(post.likes)}, ${sqlNumber(post.replies)}, ${sqlNumber(post.reposts)},
      ${sqlNumber(post.quotes)}, ${sqlNumber(post.views)}, ${sqlNumber(post.followers || 0)}, ${sqlString(post.blueCheckStatus || "unknown")}, ${sqlString(post.blueCheckStatus || "unknown")}, ${sqlNumber(post.mediaCount)},
      ${sqlString(post.mediaJson)}, ${sqlString(post.rawJson)}, ${post.score},
      ${sqlString(post.scoreReason)}, ${sqlBool(post.sensitive)}, ${sqlString(post.clusterKey)},
      ${sqlNumber(now)}, ${sqlNumber(now)}, ${sqlNumber(now)}, ${sqlNumber(now)}, ${sqlNumber(now)}
    )
    ON CONFLICT(external_id) DO UPDATE SET
      author_handle=excluded.author_handle,
      status_url=excluded.status_url,
      text=excluded.text,
      created_timestamp=excluded.created_timestamp,
      likes=excluded.likes,
      replies=excluded.replies,
      reposts=excluded.reposts,
      quotes=excluded.quotes,
      views=excluded.views,
      author_followers=excluded.author_followers,
      author_blue_check_status=excluded.author_blue_check_status,
      author_verification_status=excluded.author_verification_status,
      media_count=excluded.media_count,
      media_json=excluded.media_json,
      raw_json=excluded.raw_json,
      score=excluded.score,
      score_reason=excluded.score_reason,
      sensitive=excluded.sensitive,
      cluster_key=excluded.cluster_key,
      observed_at=excluded.observed_at,
      last_seen_at=excluded.last_seen_at,
      last_metrics_at=excluded.last_metrics_at,
      reader_received_at=excluded.reader_received_at;
  `);
  recordClusterObservation(post, now);
  recordPostMetricSnapshot(post, now);
  recordClusterMetricSnapshot(post.clusterKey, now);
  return !existing;
}

export function recordClusterObservation(post: Pick<ObservedPost, "externalId" | "clusterKey">, now: number): void {
  if (!post.clusterKey) return;
  exec(`INSERT INTO opportunity_clusters (cluster_key, first_seen_at, last_seen_at)
    VALUES (${sqlString(post.clusterKey)}, ${sqlNumber(now)}, ${sqlNumber(now)})
    ON CONFLICT(cluster_key) DO UPDATE SET last_seen_at=excluded.last_seen_at;`);
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters WHERE cluster_key=${sqlString(post.clusterKey)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("cluster persistence failed");
  exec(`INSERT OR IGNORE INTO cluster_observations (cluster_id, post_external_id, observed_at)
    VALUES (${sqlNumber(cluster.id)}, ${sqlString(post.externalId)}, ${sqlNumber(now)});`);
}

function rawMetricSnapshot(post: ObservedPost): { likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; views: number | null; followers: number | null; quality: "ok" | "partial" } {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(post.rawJson) as unknown;
    raw = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return { likes: null, replies: null, reposts: null, quotes: null, views: null, followers: null, quality: "partial" };
  }
  const tweet = raw.tweet && typeof raw.tweet === "object" ? raw.tweet as Record<string, unknown> : raw;
  const author = tweet.author && typeof tweet.author === "object" ? tweet.author as Record<string, unknown> : {};
  const value = (keys: string[]): number | null => {
    for (const key of keys) {
      if (!(key in tweet)) continue;
      const metric = Number(tweet[key]);
      return Number.isFinite(metric) && metric >= 0 ? Math.round(metric) : null;
    }
    return null;
  };
  const followerValue = author.followers;
  const followers = followerValue === undefined ? null : Number.isFinite(Number(followerValue)) && Number(followerValue) >= 0 ? Math.round(Number(followerValue)) : null;
  const metrics = {
    likes: value(["likes"]), replies: value(["replies"]), reposts: value(["reposts", "retweets"]),
    quotes: value(["quotes"]), views: value(["views"]), followers,
  };
  return { ...metrics, quality: Object.values(metrics).every((metric) => metric !== null) ? "ok" : "partial" };
}

export function recordPostMetricSnapshot(post: ObservedPost, now: number): void {
  const metrics = rawMetricSnapshot(post);
  exec(`INSERT INTO post_metric_snapshots (
    post_external_id, likes, replies, reposts, quotes, views, followers, metric_quality, captured_at
  ) VALUES (
    ${sqlString(post.externalId)}, ${metrics.likes ?? "NULL"}, ${metrics.replies ?? "NULL"}, ${metrics.reposts ?? "NULL"},
    ${metrics.quotes ?? "NULL"}, ${metrics.views ?? "NULL"}, ${metrics.followers ?? "NULL"}, ${sqlString(metrics.quality)}, ${sqlNumber(now)}
  );`);
}

export function recordClusterMetricSnapshot(clusterKey: string, now: number): void {
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters WHERE cluster_key=${sqlString(clusterKey)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("cluster metrics require a persisted cluster");
  const snapshot = criticalRows<{
    post_count: number; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; views: number | null;
    likes_count: number; replies_count: number; reposts_count: number; quotes_count: number; views_count: number;
  }>(`WITH latest AS (
      SELECT snapshot.* FROM post_metric_snapshots snapshot
      JOIN (SELECT post_external_id, MAX(id) AS id FROM post_metric_snapshots GROUP BY post_external_id) newest ON newest.id=snapshot.id
    ) SELECT COUNT(observation.post_external_id) AS post_count,
      CASE WHEN COUNT(latest.likes)=0 THEN NULL ELSE SUM(latest.likes) END AS likes,
      CASE WHEN COUNT(latest.replies)=0 THEN NULL ELSE SUM(latest.replies) END AS replies,
      CASE WHEN COUNT(latest.reposts)=0 THEN NULL ELSE SUM(latest.reposts) END AS reposts,
      CASE WHEN COUNT(latest.quotes)=0 THEN NULL ELSE SUM(latest.quotes) END AS quotes,
      CASE WHEN COUNT(latest.views)=0 THEN NULL ELSE SUM(latest.views) END AS views,
      COUNT(latest.likes) AS likes_count, COUNT(latest.replies) AS replies_count,
      COUNT(latest.reposts) AS reposts_count, COUNT(latest.quotes) AS quotes_count, COUNT(latest.views) AS views_count
    FROM cluster_observations observation
    LEFT JOIN latest ON latest.post_external_id=observation.post_external_id
    WHERE observation.cluster_id=${sqlNumber(cluster.id)};`)[0];
  if (!snapshot) throw new Error("cluster metrics aggregation failed");
  const quality = [snapshot.likes_count, snapshot.replies_count, snapshot.reposts_count, snapshot.quotes_count, snapshot.views_count]
    .every((count) => count === snapshot.post_count) ? "ok" : "partial";
  exec(`INSERT INTO cluster_metric_snapshots (
      cluster_id, post_count, likes, replies, reposts, quotes, views, metric_quality, captured_at
    ) VALUES (
      ${sqlNumber(cluster.id)}, ${sqlNumber(snapshot.post_count)}, ${snapshot.likes ?? "NULL"}, ${snapshot.replies ?? "NULL"},
      ${snapshot.reposts ?? "NULL"}, ${snapshot.quotes ?? "NULL"}, ${snapshot.views ?? "NULL"}, ${sqlString(quality)}, ${sqlNumber(now)}
    );`);
}

export type MetricBaseline = {
  sampleCount: number;
  engagement: number | null;
  views: number | null;
  ageSeconds: number;
};

export function sourceCategoryMetricBaseline(sourceHandle: string, categorySlugs: string[], ageSeconds: number, now: number, minimumSamples = 5): MetricBaseline | null {
  const categories = [...new Set(categorySlugs.map((slug) => slug.trim().toLocaleLowerCase("tr-TR")).filter(Boolean))];
  if (!sourceHandle || !categories.length || !Number.isInteger(ageSeconds) || ageSeconds < 1) return null;
  const categoryWhere = categories.map(sqlString).join(", ");
  const sample = criticalRows<{ sample_count: number; engagement: number | null; views: number | null }>(`WITH ranked AS (
      SELECT post.external_id, snapshot.likes, snapshot.replies, snapshot.reposts, snapshot.quotes, snapshot.views,
        ROW_NUMBER() OVER (PARTITION BY post.external_id ORDER BY ABS(snapshot.captured_at - post.first_seen_at - ${sqlNumber(ageSeconds)})) AS rank
      FROM observed_posts post
      INNER JOIN opportunity_clusters cluster ON cluster.cluster_key=post.cluster_key
      INNER JOIN cluster_categories labels ON labels.cluster_id=cluster.id
      INNER JOIN categories category ON category.id=labels.category_id
      INNER JOIN post_metric_snapshots snapshot ON snapshot.post_external_id=post.external_id
      WHERE post.source_handle=${sqlString(sourceHandle)}
        AND category.slug IN (${categoryWhere})
        AND post.first_seen_at > 0 AND post.first_seen_at <= ${sqlNumber(now - ageSeconds)}
        AND snapshot.metric_quality='ok'
        AND snapshot.captured_at BETWEEN post.first_seen_at + ${sqlNumber(ageSeconds - 120)} AND post.first_seen_at + ${sqlNumber(ageSeconds + 600)}
    ) SELECT COUNT(*) AS sample_count,
      AVG(likes + replies + reposts + quotes) AS engagement,
      AVG(views) AS views
    FROM ranked WHERE rank=1;`)[0];
  if (!sample || sample.sample_count < minimumSamples || sample.engagement === null || sample.views === null) return null;
  return { sampleCount: sample.sample_count, engagement: sample.engagement, views: sample.views, ageSeconds };
}

export function postMetricSnapshot(externalId: string): MetricSnapshot | null {
  const snapshot = criticalRows<{
    likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; views: number | null;
    captured_at: number; metric_quality: MetricSnapshot["quality"];
  }>(`SELECT likes, replies, reposts, quotes, views, captured_at, metric_quality
    FROM post_metric_snapshots WHERE post_external_id=${sqlString(externalId)} ORDER BY id DESC LIMIT 1;`)[0];
  return snapshot ? {
    likes: snapshot.likes, replies: snapshot.replies, reposts: snapshot.reposts, quotes: snapshot.quotes, views: snapshot.views,
    capturedAt: snapshot.captured_at, quality: snapshot.metric_quality,
  } : null;
}

export function classifyCluster(clusterKey: string, kind: CategoryClusterStrategy, categorySlugs: string[], now: number): void {
  const cluster = criticalRows<{ id: number; kind: string }>(`SELECT id, kind FROM opportunity_clusters WHERE cluster_key=${sqlString(clusterKey)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("cluster classification requires a persisted cluster");
  if (cluster.kind !== kind) {
    exec(`UPDATE opportunity_clusters SET kind=${sqlString(kind)} WHERE id=${sqlNumber(cluster.id)};`);
    exec(`INSERT INTO cluster_audits (cluster_id, action, from_kind, to_kind, reason, created_at)
      VALUES (${sqlNumber(cluster.id)}, 'reclassify', ${sqlString(cluster.kind)}, ${sqlString(kind)}, 'AI category classification', ${sqlNumber(now)});`);
  }
  for (const category of getCategories().filter((item) => categorySlugs.includes(item.slug))) {
    exec(`INSERT INTO cluster_categories (cluster_id, category_id, confidence, classified_at)
      VALUES (${sqlNumber(cluster.id)}, ${sqlNumber(category.id)}, 1, ${sqlNumber(now)})
      ON CONFLICT(cluster_id, category_id) DO UPDATE SET confidence=excluded.confidence, classified_at=excluded.classified_at;`);
  }
}

export function mergeClusters(fromKey: string, intoKey: string, now: number, reason = "manual semantic merge"): void {
  if (!fromKey || !intoKey || fromKey === intoKey) throw new Error("geçerli iki farklı cluster gerekli");
  const [from, into] = [fromKey, intoKey].map((key) => criticalRows<{ id: number; kind: string }>(`SELECT id, kind FROM opportunity_clusters WHERE cluster_key=${sqlString(key)} LIMIT 1;`)[0]);
  if (!from || !into) throw new Error("merge cluster bulunamadı");
  const dependencies = criticalRows<{ count: number }>(`SELECT COUNT(*) AS count FROM publications WHERE cluster_id IN (${sqlNumber(from.id)}, ${sqlNumber(into.id)})
    UNION ALL SELECT COUNT(*) AS count FROM account_opportunities WHERE cluster_id IN (${sqlNumber(from.id)}, ${sqlNumber(into.id)});`).reduce((total, row) => total + row.count, 0);
  if (dependencies) throw new Error("publication veya account opportunity içeren cluster merge edilemez");
  exec("BEGIN;");
  try {
    exec(`INSERT OR IGNORE INTO cluster_observations (cluster_id, post_external_id, observed_at)
      SELECT ${sqlNumber(into.id)}, post_external_id, observed_at FROM cluster_observations WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`INSERT OR IGNORE INTO cluster_categories (cluster_id, category_id, confidence, classified_at)
      SELECT ${sqlNumber(into.id)}, category_id, confidence, classified_at FROM cluster_categories WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`UPDATE observed_posts SET cluster_key=${sqlString(intoKey)} WHERE cluster_key=${sqlString(fromKey)};`);
    exec(`UPDATE cluster_metric_snapshots SET cluster_id=${sqlNumber(into.id)} WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`UPDATE decision_records SET cluster_id=${sqlNumber(into.id)} WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`DELETE FROM cluster_observations WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`DELETE FROM cluster_categories WHERE cluster_id=${sqlNumber(from.id)};`);
    exec(`INSERT INTO cluster_audits (cluster_id, action, from_kind, to_kind, reason, created_at)
      VALUES (${sqlNumber(into.id)}, 'merge', ${sqlString(from.kind)}, ${sqlString(into.kind)}, ${sqlString(reason)}, ${sqlNumber(now)});`);
    exec(`DELETE FROM opportunity_clusters WHERE id=${sqlNumber(from.id)};`);
    exec("COMMIT;");
  } catch (error) {
    exec("ROLLBACK;");
    throw error;
  }
}

export function recordDecision(input: { externalId: string; clusterKey: string; accountIds: number[]; categories: string[]; score: number; selected: boolean; reasonCode: string; details?: Record<string, unknown>; now: number }): void {
  for (const accountId of input.accountIds) requireOwnedAccount(accountId);
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters WHERE cluster_key=${sqlString(input.clusterKey)} LIMIT 1;`)[0];
  exec(`INSERT INTO decision_records (
    cluster_id, post_external_id, candidate_account_ids_json, category_slugs_json, score, selected, reason_code, details_json, decided_at
  ) VALUES (
    ${cluster ? sqlNumber(cluster.id) : "NULL"}, ${sqlString(input.externalId)}, ${sqlString(JSON.stringify(input.accountIds))},
    ${sqlString(JSON.stringify(input.categories))}, ${sqlNumber(input.score)}, ${sqlBool(input.selected)}, ${sqlString(input.reasonCode)},
    ${sqlString(JSON.stringify(input.details || {}))}, ${sqlNumber(input.now)}
  );`);
}

export function updatePostScore(externalId: string, score: number, scoreReason: string): void {
  exec(`UPDATE observed_posts SET score=${sqlNumber(score)}, score_reason=${sqlString(scoreReason)}
    WHERE external_id=${sqlString(externalId)};`);
}

export function recordRun(run: {
  startedAt: number;
  finishedAt: number;
  sourceCount: number;
  postsSeen: number;
  postsNew: number;
  errors: string;
  status: string;
}): void {
  exec(`INSERT INTO scan_runs
    (started_at, finished_at, source_count, posts_seen, posts_new, errors, status)
    VALUES (${sqlNumber(run.startedAt)}, ${sqlNumber(run.finishedAt)},
      ${sqlNumber(run.sourceCount)}, ${sqlNumber(run.postsSeen)}, ${sqlNumber(run.postsNew)},
      ${sqlString(run.errors)}, ${sqlString(run.status)});`);
}

export function candidates(limit = 12, now = Math.floor(Date.now() / 1000)): RecentPost[] {
  const configured = currentOwnerId() ? getAccountSourceCategoryConfigs() : getSourceCategoryConfigs();
  const configuredSources = new Set(configured.filter((item) => item.enabled).map((item) => item.sourceHandle));
  const threshold = opportunityPoolThreshold();
  return selectPosts(`${opportunityWhere(now)} AND score_reason LIKE 'deterministic:%' AND publish_status IN ('not_started','blocked')`, "created_timestamp DESC")
    .filter((post) => configuredSources.has(post.sourceHandle))
    .filter((post) => opportunityScoreForPost(post, now) >= threshold)
    .sort((left, right) => opportunityScoreForPost(right, now) - opportunityScoreForPost(left, now) || right.createdTimestamp - left.createdTimestamp)
    .slice(0, limit);
}

export function hasPublishedCluster(clusterKey: string, accountId?: number): boolean {
  requireValidOptionalAccount(accountId);
  if (accountId) {
    return criticalRows<{ count: number }>(`SELECT (
      SELECT COUNT(*) FROM publications INNER JOIN opportunity_clusters ON opportunity_clusters.id=publications.cluster_id
      WHERE opportunity_clusters.cluster_key=${sqlString(clusterKey)} AND publications.account_id=${sqlNumber(accountId)}
        AND publications.status IN ('pending_reconciliation','confirmed')
    ) + (
      SELECT COUNT(*) FROM publication_intents INNER JOIN drafts ON drafts.id=publication_intents.draft_id
      INNER JOIN observed_posts ON observed_posts.external_id=drafts.external_id
      WHERE observed_posts.cluster_key=${sqlString(clusterKey)} AND publication_intents.account_id=${sqlNumber(accountId)}
        AND publication_intents.status IN ('pending_approval','approved','dispatching','pending_reconciliation','reconciliation_required')
    ) AS count;`)[0]?.count > 0;
  }
  return criticalRows<{ count: number }>(`SELECT COUNT(*) as count FROM observed_posts
    WHERE cluster_key=${sqlString(clusterKey)} AND publish_status IN ('pending_reconciliation','confirmed');`)[0]?.count > 0;
}

export function recentPublishCount(now: number, accountId?: number): number {
  requireValidOptionalAccount(accountId);
  const accountWhere = accountId ? ` AND account_id=${sqlNumber(accountId)}` : "";
  return criticalRows<{ count: number }>(`SELECT COUNT(*) as count FROM publish_attempts
    WHERE created_at >= ${sqlNumber(now - 86400)}
      AND status IN ('pending_reconciliation','confirmed')${accountWhere};`)[0]?.count || 0;
}

export function accountPublishingReady(accountId: number, now: number, failureLimit = 3): boolean {
  if (!Number.isInteger(accountId) || accountId < 1) return false;
  requireOwnedAccount(accountId);
  const attempts = criticalRows<{ status: string }>(`SELECT status FROM publish_attempts
    WHERE account_id=${sqlNumber(accountId)} AND created_at >= ${sqlNumber(now - 86400)}
    ORDER BY created_at DESC, id DESC LIMIT ${sqlNumber(failureLimit)};`);
  return attempts.length < failureLimit || attempts.some((attempt) => attempt.status !== "blocked");
}

export function recentCategoryPublishCount(now: number, accountId: number, categorySlug: string): number {
  requireOwnedAccount(accountId);
  const wanted = categorySlug.toLocaleLowerCase("tr-TR");
  return criticalRows<{ score_reason: string }>(`SELECT observed_posts.score_reason FROM publish_attempts
      INNER JOIN observed_posts ON observed_posts.external_id=publish_attempts.post_external_id
      WHERE publish_attempts.created_at >= ${sqlNumber(now - 86400)}
        AND publish_attempts.account_id=${sqlNumber(accountId)}
        AND publish_attempts.status IN ('pending_reconciliation','confirmed');`)
    .filter((item) => scoreEvidenceFor(item.score_reason, 0).categories.some((category) => category.toLocaleLowerCase("tr-TR") === wanted)).length;
}

export function lastPublishAt(accountId: number): number {
  requireOwnedAccount(accountId);
  return criticalRows<{ created_at: number }>(`SELECT created_at FROM publish_attempts
    WHERE account_id=${sqlNumber(accountId)} AND status IN ('pending_reconciliation','confirmed')
    ORDER BY created_at DESC LIMIT 1;`)[0]?.created_at || 0;
}

export function clusterPosts(cluster: string, now = Math.floor(Date.now() / 1000)): RecentPost[] {
  return cluster ? selectPosts(`cluster_key=${sqlString(cluster)} AND sensitive=0 AND created_timestamp >= ${sqlNumber(now - 24 * 60 * 60)}`, "score DESC, created_timestamp DESC", 5) : [];
}

export function markDraft(externalId: string, text: string, status: string): void {
  const ownerId = currentOwnerId();
  if (ownerId !== undefined) {
    exec(`UPDATE drafts SET text=${sqlString(text)}, status=${sqlString(status)}, updated_at=${sqlNumber(Math.floor(Date.now() / 1000))}
      WHERE id=(SELECT id FROM drafts WHERE external_id=${sqlString(externalId)} AND owner_user_id=${sqlString(ownerId)} ORDER BY updated_at DESC, id DESC LIMIT 1)
        AND owner_user_id=${sqlString(ownerId)};`);
    return;
  }
  exec(`UPDATE observed_posts SET draft_text=${sqlString(text)}, draft_status=${sqlString(status)}
    WHERE external_id=${sqlString(externalId)};`);
}

export function getPost(externalId: string): RecentPost | null {
  const post = rows<RecentPost>(`SELECT
    external_id as externalId, source_handle as sourceHandle, author_handle as authorHandle,
    status_url as statusUrl, text, created_timestamp as createdTimestamp, likes, replies,
    reposts, quotes, views, author_followers as followers, media_count as mediaCount, media_json as mediaJson,
    raw_json as rawJson, score, score_reason as scoreReason, sensitive, cluster_key as clusterKey,
    relevance_score as relevanceScore, relevance_source as relevanceSource, relevance_json as relevanceJson, relevance_at as relevanceAt,
    observed_at as observedAt, draft_text as draftText, draft_status as draftStatus, publish_status as publishStatus
    FROM observed_posts WHERE external_id=${sqlString(externalId)} LIMIT 1;`)[0] || null;
  return post ? ownerPostState(post) : null;
}

export const METRIC_SNAPSHOT_MILESTONES = [120, 300, 600, 1200, 3600] as const;

export function nextMetricSnapshotAt(firstSeenAt: number, lastMetricsAt: number, now: number): number | null {
  if (!firstSeenAt || firstSeenAt > now) return null;
  return METRIC_SNAPSHOT_MILESTONES
    .map((age) => firstSeenAt + age)
    .find((scheduledAt) => scheduledAt <= now && scheduledAt > lastMetricsAt) || null;
}

export function metricRefreshPosts(now: number, limit = 25): RecentPost[] {
  return rows<RecentPost>(`SELECT
    external_id as externalId, source_handle as sourceHandle, author_handle as authorHandle,
    status_url as statusUrl, text, created_timestamp as createdTimestamp, likes, replies,
    reposts, quotes, views, author_followers as followers, media_count as mediaCount, media_json as mediaJson,
    raw_json as rawJson, score, score_reason as scoreReason, sensitive, cluster_key as clusterKey,
    observed_at as observedAt, draft_text as draftText, draft_status as draftStatus, publish_status as publishStatus,
    first_seen_at as firstSeenAt, last_metrics_at as lastMetricsAt
    FROM observed_posts WHERE first_seen_at > 0 AND first_seen_at <= ${sqlNumber(now - METRIC_SNAPSHOT_MILESTONES[0])}
      AND first_seen_at >= ${sqlNumber(now - METRIC_SNAPSHOT_MILESTONES.at(-1)! - 300)}
    ORDER BY last_metrics_at ASC LIMIT ${sqlNumber(limit)};`).filter((post) => {
    const row = post as RecentPost & { firstSeenAt: number; lastMetricsAt: number };
    return nextMetricSnapshotAt(row.firstSeenAt, row.lastMetricsAt, now) !== null;
  });
}

function remotePostId(remoteUrl: string): string {
  return remoteUrl.match(/\/status\/(\d+)/)?.[1] || "";
}

function syncPublicationAttempt(input: {
  externalId: string;
  accountId?: number;
  status: string;
  remoteUrl?: string;
  now: number;
}): void {
  if (!input.accountId) return;
  const post = criticalRows<{ cluster_key: string }>(`SELECT cluster_key FROM observed_posts
    WHERE external_id=${sqlString(input.externalId)} LIMIT 1;`)[0];
  if (!post?.cluster_key) return;
  command(`INSERT INTO opportunity_clusters (cluster_key, first_seen_at, last_seen_at)
    VALUES (${sqlString(post.cluster_key)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)})
    ON CONFLICT(cluster_key) DO UPDATE SET last_seen_at=excluded.last_seen_at;`);
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters
    WHERE cluster_key=${sqlString(post.cluster_key)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("cluster persistence failed");
  command(`INSERT OR IGNORE INTO cluster_observations (cluster_id, post_external_id, observed_at)
    VALUES (${sqlNumber(cluster.id)}, ${sqlString(input.externalId)}, ${sqlNumber(input.now)});`);
  command(`INSERT INTO account_opportunities (cluster_id, account_id, status, created_at, updated_at)
    VALUES (${sqlNumber(cluster.id)}, ${sqlNumber(input.accountId)}, ${sqlString(input.status)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)})
    ON CONFLICT(cluster_id, account_id) DO UPDATE SET
      status=CASE WHEN account_opportunities.status='confirmed' THEN account_opportunities.status ELSE excluded.status END,
      updated_at=excluded.updated_at;`);
  const opportunity = criticalRows<{ id: number }>(`SELECT id FROM account_opportunities
    WHERE cluster_id=${sqlNumber(cluster.id)} AND account_id=${sqlNumber(input.accountId)} LIMIT 1;`)[0];
  if (!opportunity) throw new Error("account opportunity persistence failed");
  const remoteId = remotePostId(input.remoteUrl || "");
  command(`INSERT INTO publications (
      cluster_id, account_opportunity_id, account_id, source_observation_external_id,
      remote_post_id, remote_url, status, requested_at, confirmed_at
    ) VALUES (
      ${sqlNumber(cluster.id)}, ${sqlNumber(opportunity.id)}, ${sqlNumber(input.accountId)}, ${sqlString(input.externalId)},
      ${sqlString(remoteId)}, ${sqlString(input.remoteUrl || "")}, ${sqlString(input.status)}, ${sqlNumber(input.now)},
      ${input.status === "confirmed" ? sqlNumber(input.now) : "NULL"}
    ) ON CONFLICT(account_opportunity_id) DO UPDATE SET
      remote_post_id=CASE WHEN excluded.remote_post_id<>'' THEN excluded.remote_post_id ELSE publications.remote_post_id END,
      remote_url=CASE WHEN excluded.remote_url<>'' THEN excluded.remote_url ELSE publications.remote_url END,
      status=CASE WHEN excluded.status='confirmed' THEN 'confirmed' ELSE publications.status END,
      confirmed_at=CASE WHEN excluded.status='confirmed' THEN excluded.confirmed_at ELSE publications.confirmed_at END;`);
}

export function recordAccountOpportunities(input: {
  clusterKey: string;
  accountIds: number[];
  categorySlugs: string[];
  score: number;
  confidence: number;
  now: number;
  accountProfiles?: Array<{ accountId: number; categorySlugs: string[]; score: number; confidence: number }>;
}): void {
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters WHERE cluster_key=${sqlString(input.clusterKey)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("account opportunities require a persisted cluster");
  const categories = getCategories().filter((category) => input.categorySlugs.includes(category.slug));
  const profiles = input.accountProfiles !== undefined
    ? input.accountProfiles
    : [...new Set(input.accountIds)].filter(Number.isInteger).map((accountId) => ({ accountId, categorySlugs: input.categorySlugs, score: input.score, confidence: input.confidence }));
  for (const profile of profiles) {
    const accountId = profile.accountId;
    requireOwnedAccount(accountId);
    const profileCategories = categories.filter((category) => profile.categorySlugs.includes(category.slug));
    exec(`INSERT INTO account_opportunities (
      cluster_id, account_id, status, primary_category_id, matched_category_ids_json, category_scores_json,
      expected_incremental_reach, publish_confidence, created_at, updated_at
    ) VALUES (
      ${sqlNumber(cluster.id)}, ${sqlNumber(accountId)}, 'candidate', ${profileCategories[0] ? sqlNumber(profileCategories[0].id) : "NULL"},
      ${sqlString(JSON.stringify(profileCategories.map((category) => category.id)))}, ${sqlString(JSON.stringify(Object.fromEntries(profileCategories.map((category) => [category.slug, profile.score]))))},
      ${sqlNumber(profile.score)}, ${sqlNumber(profile.confidence)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
    ) ON CONFLICT(cluster_id, account_id) DO UPDATE SET
      status=CASE WHEN account_opportunities.status IN ('confirmed','pending_reconciliation') THEN account_opportunities.status ELSE excluded.status END,
      primary_category_id=excluded.primary_category_id, matched_category_ids_json=excluded.matched_category_ids_json,
      category_scores_json=excluded.category_scores_json, expected_incremental_reach=excluded.expected_incremental_reach,
      publish_confidence=excluded.publish_confidence, updated_at=excluded.updated_at;`);
  }
}

export function recordPublishAttempt(input: {
  externalId: string;
  accountId?: number;
  publicationIntentId?: number;
  status: string;
  reason: string;
  receipt: string;
  remoteUrl?: string;
  now: number;
}): void {
  requireValidOptionalAccount(input.accountId);
  const accountSql = input.accountId ? sqlNumber(input.accountId) : "NULL";
  if (input.status === "blocked") {
    const existing = rows<{ id: number }>(`SELECT id FROM publish_attempts
      WHERE post_external_id=${sqlString(input.externalId)}
        AND COALESCE(account_id, 0)=COALESCE(${accountSql}, 0)
        AND status='blocked'
      ORDER BY id DESC LIMIT 1;`)[0];
    if (existing) {
      exec(`UPDATE publish_attempts SET reason=${sqlString(input.reason)}, receipt=${sqlString(input.receipt)},
        remote_url=${sqlString(input.remoteUrl || "")}, updated_at=${sqlNumber(input.now)}, occurrences=occurrences+1
        WHERE id=${sqlNumber(existing.id)};`);
      exec(`UPDATE observed_posts SET publish_status='blocked' WHERE external_id=${sqlString(input.externalId)};`);
      syncPublicationAttempt(input);
      return;
    }
  }
  exec(`INSERT INTO publish_attempts
    (post_external_id, account_id, publication_intent_id, status, reason, receipt, remote_url, created_at, updated_at, occurrences)
    VALUES (${sqlString(input.externalId)}, ${accountSql}, ${input.publicationIntentId ? sqlNumber(input.publicationIntentId) : "NULL"},
      ${sqlString(input.status)}, ${sqlString(input.reason)}, ${sqlString(input.receipt)},
      ${sqlString(input.remoteUrl || "")}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)}, 1);`);
  exec(`UPDATE observed_posts SET publish_status=${sqlString(input.status)}
    WHERE external_id=${sqlString(input.externalId)};`);
  syncPublicationAttempt(input);
}

export function pendingAttempts(): Array<{
  id: number;
  post_external_id: string;
  account_id: number | null;
  receipt: string;
  remote_url: string;
}> {
  return rows<{ id: number; post_external_id: string; account_id: number | null; receipt: string; remote_url: string }>(`SELECT id, post_external_id, account_id, receipt, remote_url FROM publish_attempts
    WHERE status='pending_reconciliation' ORDER BY created_at ASC LIMIT 20;`);
}

export const FEEDBACK_MILESTONES = [
  ["5dk", 5 * 60],
  ["15dk", 15 * 60],
  ["60dk", 60 * 60],
  ["6s", 6 * 60 * 60],
  ["24s", 24 * 60 * 60],
  ["7g", 7 * 24 * 60 * 60],
  ["14g", 14 * 24 * 60 * 60],
] as const;

function feedbackMilestones(createdAt: number, now: number): string[] {
  return FEEDBACK_MILESTONES
    .filter(([, seconds]) => now >= createdAt + seconds)
    .map(([label]) => label);
}

type MetricInput = Partial<PublicMetrics> & { poll_votes?: unknown };

function metricValues(input: MetricInput): PublicMetrics {
  return {
    likes: Math.max(0, Number(input.likes) || 0),
    replies: Math.max(0, Number(input.replies) || 0),
    reposts: Math.max(0, Number(input.reposts) || 0),
    quotes: Math.max(0, Number(input.quotes) || 0),
    views: Math.max(0, Number(input.views) || 0),
    pollVotes: Math.max(0, Number(input.pollVotes ?? input.poll_votes) || 0),
  };
}

export function metricBreakdown(input: MetricInput) {
  const metrics = metricValues(input);
  const engagements = metrics.likes + metrics.replies + metrics.reposts + metrics.quotes;
  const denominator = metrics.views > 0 ? metrics.views : 0;
  return {
    ...metrics,
    engagements,
    engagementRate: denominator ? engagements / denominator : 0,
    replyRate: denominator ? metrics.replies / denominator : 0,
    repostRate: denominator ? metrics.reposts / denominator : 0,
    quoteRate: denominator ? metrics.quotes / denominator : 0,
  };
}

function emptyMetricBreakdown(): ReturnType<typeof metricBreakdown> {
  return metricBreakdown({});
}

function mergeMetricBreakdowns(left: ReturnType<typeof metricBreakdown>, right: ReturnType<typeof metricBreakdown>): ReturnType<typeof metricBreakdown> {
  return metricBreakdown({
    likes: left.likes + right.likes,
    replies: left.replies + right.replies,
    reposts: left.reposts + right.reposts,
    quotes: left.quotes + right.quotes,
    views: left.views + right.views,
    pollVotes: left.pollVotes + right.pollVotes,
  });
}

export function feedbackDueAttempts(now: number): Array<{
  post_external_id: string;
  account_id: number | null;
  receipt: string;
  remote_url: string;
  milestones: string[];
}> {
  const attempts = rows<{ post_external_id: string; account_id: number | null; receipt: string; remote_url: string; created_at: number }>(`
    SELECT post_external_id, account_id, receipt, remote_url, created_at FROM publish_attempts
    WHERE status='confirmed' AND post_external_id<>''
      AND created_at >= ${sqlNumber(now - 14 * 86400)}
      ${currentOwnerId() ? `AND account_id IN (SELECT id FROM accounts WHERE owner_user_id=${sqlString(currentOwnerId()!)})` : ""}
    ORDER BY created_at ASC LIMIT 40;
  `);
  return attempts.map((attempt) => {
    const completed = new Set(rows<{ milestone: string }>(`SELECT DISTINCT milestone FROM feedback_snapshots
      WHERE post_external_id=${sqlString(attempt.post_external_id)};`).map((snapshot) => snapshot.milestone));
    return {
      ...attempt,
      milestones: feedbackMilestones(attempt.created_at, now).filter((milestone) => !completed.has(milestone)),
    };
  }).filter((attempt) => attempt.milestones.length > 0).slice(0, 20);
}

export function confirmPublish(attemptId: number, externalId: string): boolean {
  const attempt = criticalRows<{ account_id: number | null; remote_url: string }>(`SELECT attempt.account_id, attempt.remote_url FROM publish_attempts AS attempt
    WHERE attempt.id=${sqlNumber(attemptId)} AND attempt.status='pending_reconciliation'
      ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM accounts AS owner_account WHERE owner_account.id=attempt.account_id AND owner_account.owner_user_id=${sqlString(currentOwnerId()!)})` : ""} AND EXISTS (
      SELECT 1 FROM publication_intents AS intent
      INNER JOIN drafts ON drafts.id=intent.draft_id
      WHERE intent.account_id=attempt.account_id AND drafts.external_id=attempt.post_external_id
        AND drafts.external_id=${sqlString(externalId)} AND intent.dispatched_at IS NOT NULL
        AND attempt.publication_intent_id=intent.id
        AND intent.status IN ('pending_reconciliation','confirmed')
    ) LIMIT 1;`)[0];
  if (!attempt) return false;
  exec(`UPDATE publish_attempts SET status='confirmed', reason='FxTwitter reconciliation confirmed'
    WHERE id=${sqlNumber(attemptId)} AND status='pending_reconciliation';`);
  if (currentOwnerId() === undefined) exec(`UPDATE observed_posts SET publish_status='confirmed' WHERE external_id=${sqlString(externalId)};`);
  if (attempt) {
    if (attempt.account_id) {
      exec(`UPDATE automation_jobs SET status='confirmed', reconciliation_status='confirmed', remote_url=${sqlString(attempt.remote_url)}, reason='FxTwitter reconciliation confirmed', updated_at=${sqlNumber(Math.floor(Date.now() / 1000))}
        WHERE account_id=${sqlNumber(attempt.account_id)} AND draft_id IN (
          SELECT id FROM drafts WHERE external_id=${sqlString(externalId)}
        ) AND status IN ('queued','submitted','pending_reconciliation','running');`);
    }
    syncPublicationAttempt({
      externalId,
      accountId: attempt.account_id || undefined,
      status: "confirmed",
      remoteUrl: attempt.remote_url,
      now: Math.floor(Date.now() / 1000),
    });
  }
  return true;
}

export function recordFeedbackSnapshot(input: {
  externalId: string;
  accountId?: number | null;
  remotePostId?: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views: number;
  pollVotes?: number;
  publisherBlueCheckStatus?: BlueCheckStatus;
  milestone?: string;
  now: number;
}): void {
  requireValidOptionalAccount(input.accountId);
  exec(`INSERT INTO feedback_snapshots
    (post_external_id, likes, replies, reposts, quotes, views, poll_votes, publisher_blue_check_status, publisher_verification_status, milestone, captured_at)
    VALUES (${sqlString(input.externalId)}, ${sqlNumber(input.likes)}, ${sqlNumber(input.replies)},
      ${sqlNumber(input.reposts)}, ${sqlNumber(input.quotes)}, ${sqlNumber(input.views)}, ${sqlNumber(input.pollVotes || 0)}, ${sqlString(input.publisherBlueCheckStatus || "unknown")}, ${sqlString(input.publisherBlueCheckStatus || "unknown")}, ${sqlString(input.milestone || "legacy")}, ${sqlNumber(input.now)});`);
  if (!input.accountId) return;
  const publication = criticalRows<{ id: number; remote_post_id: string }>(`SELECT id, remote_post_id FROM publications
    WHERE account_id=${sqlNumber(input.accountId)} AND source_observation_external_id=${sqlString(input.externalId)}
    ORDER BY requested_at DESC LIMIT 1;`)[0];
  if (!publication) return;
  const remotePostId = input.remotePostId || publication.remote_post_id;
  exec(`INSERT INTO publication_metric_snapshots (
      publication_id, remote_post_id, milestone, likes, replies, reposts, quotes, views, poll_votes, captured_at
    ) VALUES (
      ${sqlNumber(publication.id)}, ${sqlString(remotePostId)}, ${sqlString(input.milestone || "legacy")},
      ${sqlNumber(input.likes)}, ${sqlNumber(input.replies)}, ${sqlNumber(input.reposts)}, ${sqlNumber(input.quotes)},
      ${sqlNumber(input.views)}, ${sqlNumber(input.pollVotes || 0)}, ${sqlNumber(input.now)}
    );`);
}

const POST_COLUMNS = `SELECT
    external_id as externalId, source_handle as sourceHandle, author_handle as authorHandle,
    status_url as statusUrl, text, created_timestamp as createdTimestamp, likes, replies,
    reposts, quotes, views, author_followers as followers, author_verification_status as blueCheckStatus, media_count as mediaCount, media_json as mediaJson,
    raw_json as rawJson, score, score_reason as scoreReason, sensitive, cluster_key as clusterKey,
    relevance_score as relevanceScore, relevance_source as relevanceSource, relevance_json as relevanceJson, relevance_at as relevanceAt,
    observed_at as observedAt, draft_text as draftText, draft_status as draftStatus, publish_status as publishStatus
    FROM observed_posts`;
const MARKET_POST_COLUMNS = POST_COLUMNS.replace("raw_json as rawJson", "'' as rawJson");

function selectPosts(where: string, orderBy: string, limit?: number, columns = POST_COLUMNS): RecentPost[] {
  const whereSql = where ? ` WHERE ${where}` : "";
  const limitSql = limit === undefined ? "" : ` LIMIT ${sqlNumber(limit)}`;
  return rows<RecentPost>(`${columns}${whereSql} ORDER BY ${orderBy}${limitSql};`).map(ownerPostState);
}

function ownerPostState(post: RecentPost): RecentPost {
  const ownerId = currentOwnerId();
  if (ownerId === undefined) return post;
  const draft = rows<{ text: string; status: string }>(`SELECT text, status FROM drafts
    WHERE external_id=${sqlString(post.externalId)} AND owner_user_id=${sqlString(ownerId)}
    ORDER BY updated_at DESC, id DESC LIMIT 1;`)[0];
  const attempt = rows<{ status: string }>(`SELECT status FROM publish_attempts
    WHERE post_external_id=${sqlString(post.externalId)} AND account_id IN (SELECT id FROM accounts WHERE owner_user_id=${sqlString(ownerId)})
    ORDER BY created_at DESC, id DESC LIMIT 1;`)[0];
  return { ...post, draftText: draft?.text || "", draftStatus: draft?.status || "not_started", publishStatus: attempt?.status || "not_started" };
}

function selectMarketPosts(where: string, orderBy: string, limit?: number): RecentPost[] {
  return selectPosts(where, orderBy, limit, MARKET_POST_COLUMNS);
}

export function getRecentPosts(limit = 15): RecentPost[] {
  return selectPosts("", "observed_at DESC", limit);
}

export function getSummary(sourceCount: number): Omit<DashboardSummary, "generatedAt" | "automationEnabled" | "openaiConfigured" | "aiEnabled" | "aiConfigured" | "aiProvider" | "officialPublisherConfigured" | "automationRuntime"> {
  const now = Math.floor(Date.now() / 1000);
  const ownerAccounts = currentOwnerId() === undefined ? null : getAccounts().map((account) => account.id);
  const accountFilter = ownerAccounts === null ? "" : ` AND account_id IN (${ownerAccounts.length ? ownerAccounts.map(sqlNumber).join(",") : "-1"})`;
  if (!ensureDatabase()) {
    return {
      dbAvailable: false,
      dbError: initializationError,
      sourcesConfigured: sourceCount,
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
  const scalar = rows<{
    sourcesObserved: number;
    postsObserved: number;
    postsLast24h: number;
    attemptsPending: number;
    publishedConfirmed: number;
    publishBlocked: number;
  }>(`SELECT
    (SELECT COUNT(*) FROM sources WHERE enabled=1) as sourcesObserved,
    (SELECT COUNT(*) FROM observed_posts) as postsObserved,
    (SELECT COUNT(*) FROM observed_posts WHERE observed_at >= ${sqlNumber(now - 86400)}) as postsLast24h,
    (SELECT COUNT(*) FROM publish_attempts WHERE status='pending_reconciliation'${accountFilter}) as attemptsPending,
    (SELECT COUNT(*) FROM publish_attempts WHERE status='confirmed'${accountFilter}) as publishedConfirmed,
    (SELECT COUNT(*) FROM publish_attempts WHERE status='blocked'${accountFilter}) as publishBlocked;`)[0];
  const activity = rows<{ label: string; observed: number; opportunities: number }>(`SELECT
    strftime('%H:00', observed_at, 'unixepoch', 'localtime') as label,
    COUNT(*) as observed,
    SUM(CASE WHEN ${opportunityWhere(now)} THEN 1 ELSE 0 END) as opportunities
    FROM observed_posts WHERE observed_at >= ${sqlNumber(now - 86400)}
    GROUP BY strftime('%H:00', observed_at, 'unixepoch', 'localtime')
    ORDER BY label;`);
  const lastRun = rows<DashboardSummary["lastRun"]>(`SELECT status,
    finished_at as finishedAt, source_count as sourceCount, posts_seen as postsSeen,
    posts_new as postsNew, errors FROM scan_runs ORDER BY id DESC LIMIT 1;`)[0] || null;

  return {
    dbAvailable: true,
    sourcesConfigured: sourceCount,
    sourcesObserved: scalar?.sourcesObserved || 0,
    postsObserved: scalar?.postsObserved || 0,
    postsLast24h: scalar?.postsLast24h || 0,
    opportunities: opportunityCount(now),
    attemptsPending: scalar?.attemptsPending || 0,
    publishedConfirmed: scalar?.publishedConfirmed || 0,
    publishBlocked: scalar?.publishBlocked || 0,
    recentPosts: getRecentPosts(),
    activity,
    lastRun,
  };
}

export function getDatabaseError(): string | undefined {
  return initializationError;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const BUILTIN_CATEGORIES: Array<Pick<CategoryDefinition, "slug" | "name" | "baseStrategy" | "clusterStrategy" | "verificationMode" | "description" | "positiveExamples" | "negativeExamples" | "keywords" | "excludedKeywords" | "defaultFormats" | "sourcePolicy" | "riskPolicy" | "scoringPolicy" | "publishingPolicy" | "aiContext">> = [
  { slug: "news", name: "News", baseStrategy: "news", clusterStrategy: "event", verificationMode: "strict", ...categoryTemplate("Hızlı, kaynaklı haber özeti.") },
  { slug: "politics", name: "Politics", baseStrategy: "politics", clusterStrategy: "event", verificationMode: "strict", ...categoryTemplate("Siyasi gelişmeyi iddia ile olguyu ayırarak yaz.") },
  { slug: "technology", name: "Technology", baseStrategy: "technology", clusterStrategy: "topic", verificationMode: "moderate", ...categoryTemplate("Ürün, güvenlik ve teknoloji gelişmesini teknik olarak doğru ama anlaşılır yaz.") },
  { slug: "finance", name: "Finance", baseStrategy: "finance", clusterStrategy: "topic", verificationMode: "strict", ...categoryTemplate("Finansal bilgiyi yatırım tavsiyesi gibi sunma; kaynak ve belirsizliği belirt.") },
  { slug: "sports", name: "Sports", baseStrategy: "sports", clusterStrategy: "event", verificationMode: "moderate", ...categoryTemplate("Spor gelişmesini sonuç, kaynak ve zaman bilgisiyle kısa yaz.") },
  { slug: "entertainment", name: "Entertainment", baseStrategy: "entertainment", clusterStrategy: "topic", verificationMode: "minimal", ...categoryTemplate("Kültür ve eğlence gündemini merak uyandıran, sade bir dille yaz.") },
  { slug: "meme", name: "Meme", baseStrategy: "meme", clusterStrategy: "meme", verificationMode: "minimal", ...categoryTemplate("Meme bağlamını koru; şakayı açıklama, özgün görsel/metin kullanma.") },
  { slug: "shitpost", name: "Shitpost", baseStrategy: "shitpost", clusterStrategy: "conversation", verificationMode: "minimal", ...categoryTemplate("Kısa, absürt ve güvenli bir gözlem yaz; gerçek kişi veya olay hakkında uydurma olgu ekleme.") },
  { slug: "culture", name: "Culture", baseStrategy: "generic", clusterStrategy: "topic", verificationMode: "moderate", ...categoryTemplate("Kültür konuşmasını bağlamı koruyarak kısa ve özgün yaz.") },
  {
    slug: "magazin", name: "Magazin", baseStrategy: "entertainment", clusterStrategy: "event", verificationMode: "moderate",
    description: "Ünlüler, dizi-film, popüler kültür ve doğrulanabilir magazin gelişmeleri.", positiveExamples: ["yeni dizi projesi", "resmi ilişki açıklaması", "ödül töreni"], negativeExamples: ["doğrulanmamış dedikodu", "özel hayat ifşası"], keywords: ["ünlü", "oyuncu", "şarkıcı", "dizi", "film", "magazin", "ödül", "ilişki"], excludedKeywords: ["sızdırıldı", "anonim kaynak"], defaultFormats: ["post"], sourcePolicy: { requireAttribution: true }, riskPolicy: { privateLife: "avoid", rumor: "block" }, scoringPolicy: { novelty: "high", confirmation: "required" }, publishingPolicy: {}, aiContext: "Magazin editörüsün. Resmî açıklama, güvenilir röportaj veya açık kaynak yoksa ilişki, sağlık, ayrılık, hamilelik, ölüm ve özel hayat iddiasını yazma. Dedikoduyu kesin olgu gibi sunma. Doğrulanmış gelişmeyi kısa, merak uyandıran ve saygılı yaz; aşağılayıcı dil, body-shaming ve taciz çağrısı kullanma.",
  },
  {
    slug: "troll", name: "Troll", baseStrategy: "shitpost", clusterStrategy: "conversation", verificationMode: "minimal",
    description: "Gündemden beslenen, açıkça mizahi ve düşük riskli troll/personality içeriği.", positiveExamples: ["gündeme komik gözlem", "absürt ama zararsız tepki", "self-aware şaka"], negativeExamples: ["gerçek kişi hakkında iftira", "sahte haber", "hedefli taciz"], keywords: ["troll", "absürt", "ironi", "meme", "gündem"], excludedKeywords: ["ölüm", "deprem", "şiddet", "nefret"], defaultFormats: ["post"], sourcePolicy: { requireAttribution: false }, riskPolicy: { fabricatedFact: "block", harassment: "block", protectedTarget: "block" }, scoringPolicy: { novelty: "high", humor: "high" }, publishingPolicy: {}, aiContext: "Troll/personality yazarı gibi yaz ama şakanın kurgu olduğunu koru. Gerçek kişi, kurum veya olay hakkında uydurma olgu, sahte ekran görüntüsü, iftira, hedefli taciz, nefret, kriz/afet istismarı üretme. Kısa, tek fikirli, alıntılanabilir ve kendine de gülebilen bir ton kullan; emin değilsen olgu iddia etme.",
  },
];

function categoryTemplate(aiContext: string) {
  return { description: aiContext, positiveExamples: [], negativeExamples: [], keywords: [], excludedKeywords: [], defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext };
}

function seedBuiltinCategories(now: number): void {
  for (const category of BUILTIN_CATEGORIES) {
    command(`INSERT INTO categories (
        slug, name, enabled, built_in, base_strategy, cluster_strategy, verification_mode, description,
        positive_examples_json, negative_examples_json, keywords_json, excluded_keywords_json, default_formats_json,
        source_policy_json, risk_policy_json, scoring_policy_json, publishing_policy_json, ai_context, created_at, updated_at
      ) VALUES (
        ${sqlString(category.slug)}, ${sqlString(category.name)}, 1, 1, ${sqlString(category.baseStrategy)},
        ${sqlString(category.clusterStrategy)}, ${sqlString(category.verificationMode)}, ${sqlString(category.description)},
        ${sqlString(JSON.stringify(category.positiveExamples))}, ${sqlString(JSON.stringify(category.negativeExamples))},
        ${sqlString(JSON.stringify(category.keywords))}, ${sqlString(JSON.stringify(category.excludedKeywords))}, ${sqlString(JSON.stringify(category.defaultFormats))},
        ${sqlString(JSON.stringify(category.sourcePolicy))}, ${sqlString(JSON.stringify(category.riskPolicy))}, ${sqlString(JSON.stringify(category.scoringPolicy))}, ${sqlString(JSON.stringify(category.publishingPolicy))}, ${sqlString(category.aiContext)},
        ${sqlNumber(now)}, ${sqlNumber(now)}
      ) ON CONFLICT(slug) DO NOTHING;`);
  }
}

function categoryRows(): CategoryDefinition[] {
  return rows<{
    id: number; slug: string; name: string; enabled: number; built_in: number; base_strategy: string; cluster_strategy: string;
    verification_mode: string; description: string; positive_examples_json: string; negative_examples_json: string; keywords_json: string;
    excluded_keywords_json: string; seed_handles_json: string; default_formats_json: string; source_policy_json: string;
    risk_policy_json: string; scoring_policy_json: string; publishing_policy_json: string; ai_context: string; created_at: number; updated_at: number;
    owner_user_id: string | null; account_id: number | null;
  }>(`SELECT id, slug, name, enabled, built_in, base_strategy, cluster_strategy, verification_mode, description,
      positive_examples_json, negative_examples_json, keywords_json, excluded_keywords_json, seed_handles_json, default_formats_json,
      source_policy_json, risk_policy_json, scoring_policy_json, publishing_policy_json, ai_context, created_at, updated_at, owner_user_id, account_id
      FROM categories
      WHERE owner_user_id IS NULL OR owner_user_id=${sqlString(currentOwnerId() || "__no_owner__")}
      ORDER BY built_in DESC, name COLLATE NOCASE;`).map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    enabled: category.enabled === 1,
    builtIn: category.built_in === 1,
    baseStrategy: CATEGORY_BASE_STRATEGIES.includes(category.base_strategy as CategoryBaseStrategy) ? category.base_strategy as CategoryBaseStrategy : "generic",
    clusterStrategy: CATEGORY_CLUSTER_STRATEGIES.includes(category.cluster_strategy as CategoryClusterStrategy) ? category.cluster_strategy as CategoryClusterStrategy : "hybrid",
    verificationMode: CATEGORY_VERIFICATION_MODES.includes(category.verification_mode as CategoryVerificationMode) ? category.verification_mode as CategoryVerificationMode : "moderate",
    description: category.description,
    positiveExamples: parseArray(category.positive_examples_json),
    negativeExamples: parseArray(category.negative_examples_json),
    keywords: parseArray(category.keywords_json),
    excludedKeywords: parseArray(category.excluded_keywords_json),
    seedHandles: parseArray(category.seed_handles_json),
    defaultFormats: parseArray(category.default_formats_json),
    sourcePolicy: parseObject(category.source_policy_json),
    riskPolicy: parseObject(category.risk_policy_json),
    scoringPolicy: parseObject(category.scoring_policy_json),
    publishingPolicy: parseObject(category.publishing_policy_json),
    aiContext: category.ai_context,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
    ownerUserId: category.owner_user_id,
    accountId: category.account_id,
  }));
}

export function getCategories(): CategoryDefinition[] {
  return categoryRows();
}

export function getCategoriesForAccount(accountId: number): CategoryDefinition[] {
  requireOwnedAccount(accountId);
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated owner context required");
  return categoryRows().filter((category) => !category.ownerUserId || category.ownerUserId === owner)
    .filter((category) => category.accountId === null || category.accountId === undefined || category.accountId === accountId);
}

export function deleteCategory(id: number): boolean {
  const category = categoryRows().find((item) => item.id === id);
  if (!category) return false;
  if (category.builtIn) throw new Error("built-in category silinemez");
  exec("BEGIN;");
  try {
    exec(`DELETE FROM account_categories WHERE category_id=${sqlNumber(id)};`);
    exec(`DELETE FROM source_categories WHERE category_id=${sqlNumber(id)};`);
    exec(`DELETE FROM account_category_inferences WHERE category_id=${sqlNumber(id)};`);
    exec(`DELETE FROM category_competitors WHERE category_id=${sqlNumber(id)};`);
    exec(`DELETE FROM categories WHERE id=${sqlNumber(id)};`);
    exec("COMMIT;");
    return true;
  } catch (error) {
    exec("ROLLBACK;");
    throw error;
  }
}

export function getAccountCategoryConfigs(accountId?: number): AccountCategoryConfig[] {
  requireValidOptionalAccount(accountId);
  const where = accountId
    ? `WHERE mapping.account_id=${sqlNumber(accountId)}`
    : ownerSql("accounts.owner_user_id") ? `WHERE ${ownerSql("accounts.owner_user_id")}` : "";
  return rows<{
    account_id: number; category_id: number; slug: string; name: string; enabled: number; is_primary: number; weight: number; priority: number;
    publish_threshold: number | null; daily_budget: number | null; style_override_json: string; ai_route_override_json: string;
    source: "manual" | "inferred" | "imported"; user_modified_at: number | null;
  }>(`SELECT mapping.account_id, mapping.category_id, categories.slug, categories.name, mapping.enabled, mapping.is_primary,
      mapping.weight, mapping.priority, mapping.publish_threshold, mapping.daily_budget, mapping.style_override_json, mapping.ai_route_override_json,
      mapping.source, mapping.user_modified_at
      FROM account_categories AS mapping INNER JOIN categories ON categories.id=mapping.category_id
      INNER JOIN accounts ON accounts.id=mapping.account_id ${where}
      ORDER BY mapping.account_id, mapping.is_primary DESC, mapping.priority DESC, categories.slug;`).map((item) => ({
    accountId: item.account_id,
    categoryId: item.category_id,
    categorySlug: item.slug,
    categoryName: item.name,
    enabled: item.enabled === 1,
    primary: item.is_primary === 1,
    weight: item.weight,
    priority: item.priority,
    publishThreshold: item.publish_threshold,
    dailyBudget: item.daily_budget,
    styleOverride: parseObject(item.style_override_json),
    aiRouteOverride: parseObject(item.ai_route_override_json),
    source: item.source,
    userModifiedAt: item.user_modified_at,
  }));
}

export function saveAccountCategoryConfig(input: Omit<AccountCategoryConfig, "categorySlug" | "categoryName">): AccountCategoryConfig {
  requireOwnedAccount(input.accountId);
  if (!getAccounts().some((account) => account.id === input.accountId)) throw new Error("account bulunamadı");
  const category = getCategories().find((item) => item.id === input.categoryId);
  if (!category || (category.accountId != null && category.accountId !== input.accountId)) throw new Error("category bulunamadı");
  if (input.primary && !input.enabled) throw new Error("primary category etkin olmalı");
  if (!Number.isFinite(input.weight) || input.weight < 0 || input.weight > 10) throw new Error("category weight geçersiz");
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw new Error("category priority geçersiz");
  if (input.publishThreshold !== null && (!Number.isFinite(input.publishThreshold) || input.publishThreshold < 0 || input.publishThreshold > 100)) throw new Error("publish threshold geçersiz");
  if (input.dailyBudget !== null && (!Number.isInteger(input.dailyBudget) || input.dailyBudget < 1 || input.dailyBudget > 100)) throw new Error("daily budget geçersiz");
  exec("BEGIN;");
  try {
    if (input.primary) exec(`UPDATE account_categories SET is_primary=0 WHERE account_id=${sqlNumber(input.accountId)};`);
    exec(`INSERT INTO account_categories (
      account_id, category_id, enabled, is_primary, weight, priority, publish_threshold, daily_budget, style_override_json, ai_route_override_json, source, user_modified_at
    ) VALUES (
      ${sqlNumber(input.accountId)}, ${sqlNumber(input.categoryId)}, ${sqlBool(input.enabled)}, ${sqlBool(input.primary)},
      ${input.weight}, ${sqlNumber(input.priority)}, ${input.publishThreshold === null ? "NULL" : input.publishThreshold},
      ${input.dailyBudget === null ? "NULL" : sqlNumber(input.dailyBudget)}, ${sqlString(JSON.stringify(input.styleOverride))}, ${sqlString(JSON.stringify(input.aiRouteOverride))}, 'manual', unixepoch()
    ) ON CONFLICT(account_id, category_id) DO UPDATE SET
      enabled=excluded.enabled, is_primary=excluded.is_primary, weight=excluded.weight, priority=excluded.priority,
      publish_threshold=excluded.publish_threshold, daily_budget=excluded.daily_budget,
      style_override_json=excluded.style_override_json, ai_route_override_json=excluded.ai_route_override_json,
      source='manual', user_modified_at=unixepoch();`);
    exec("COMMIT;");
  } catch (error) {
    exec("ROLLBACK;");
    throw error;
  }
  const result = getAccountCategoryConfigs(input.accountId).find((item) => item.categoryId === input.categoryId);
  if (!result) throw new Error("account category kaydedilemedi");
  return result;
}

export function getOwnAccountInference(accountId: number): { status: string; result: AccountCategoryInferenceResult; jobId: number; updatedAt: number } | null {
  requireOwnedAccount(accountId);
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated owner context required");
  const job = rows<{ id: number; status: string; result_json: string | null; updated_at: number }>(`SELECT id,status,result_json,updated_at FROM account_category_inference_jobs
    WHERE owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(accountId)} ORDER BY version DESC LIMIT 1;`)[0];
  if (!job?.result_json) return null;
  const result = JSON.parse(job.result_json) as AccountCategoryInferenceResult;
  const pending = rows<{ category_id: number; confidence: number; evidence_json: string }>(`SELECT category_id,confidence,evidence_json FROM account_category_inferences
    WHERE job_id=${sqlNumber(job.id)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(accountId)} AND accepted_at IS NULL AND rejected_at IS NULL;`);
  result.suggestions = result.suggestions.filter((suggestion) => pending.some((item) => item.category_id === suggestion.categoryId))
    .map((suggestion) => {
      const item = pending.find((candidate) => candidate.category_id === suggestion.categoryId)!;
      return { ...suggestion, confidence: item.confidence, evidence: JSON.parse(item.evidence_json) as string[] };
    });
  return { status: job.status, result, jobId: job.id, updatedAt: job.updated_at };
}

export function saveAccountInferenceJob(input: { accountId: number; status: "running" | "failed"; now: number; regenerate?: boolean; jobId?: number }): AccountCategoryInferenceJob & { claimed: boolean } {
  requireOwnedAccount(input.accountId);
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated owner context required");
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new Error("inference timestamp is invalid");
  if (input.jobId) {
    exec(`UPDATE account_category_inference_jobs SET status=${sqlString(input.status)},updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.jobId)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)};`);
    const row = rows<{ id: number; status: string; version: number; updated_at: number; result_json: string | null }>(`SELECT id,status,version,updated_at,result_json FROM account_category_inference_jobs WHERE id=${sqlNumber(input.jobId)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)};`)[0];
    if (!row) throw new Error("inference job not found");
    return { id: row.id, accountId: input.accountId, status: row.status, version: row.version, updatedAt: row.updated_at,
      result: row.result_json ? JSON.parse(row.result_json) as AccountCategoryInferenceResult : null, claimed: true };
  }
  exec("BEGIN IMMEDIATE;");
  try {
    const latest = rows<{ id: number; status: string; version: number; updated_at: number; result_json: string | null }>(`SELECT id,status,version,updated_at,result_json FROM account_category_inference_jobs
      WHERE owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)} ORDER BY version DESC LIMIT 1;`)[0];
    if (!input.regenerate && latest && ["ready", "insufficient_evidence"].includes(latest.status)) {
      exec("COMMIT;");
      return { id: latest.id, accountId: input.accountId, status: latest.status, version: latest.version, updatedAt: latest.updated_at,
        result: latest.result_json ? JSON.parse(latest.result_json) as AccountCategoryInferenceResult : null, claimed: false };
    }
    if (!input.regenerate && latest?.status === "running" && latest.updated_at > input.now - 300) {
      exec("COMMIT;");
      return { id: latest.id, accountId: input.accountId, status: latest.status, version: latest.version, updatedAt: latest.updated_at,
        result: latest.result_json ? JSON.parse(latest.result_json) as AccountCategoryInferenceResult : null, claimed: false };
    }
    const version = (latest?.version || 0) + 1;
    command(`INSERT INTO account_category_inference_jobs(owner_user_id,account_id,version,status,result_json,created_at,updated_at)
      VALUES(${sqlString(owner)},${sqlNumber(input.accountId)},${sqlNumber(version)},'running',NULL,${sqlNumber(input.now)},${sqlNumber(input.now)});`);
    const id = Number(rows<{ id: number }>("SELECT last_insert_rowid() id;")[0]?.id);
    exec("COMMIT;");
    return { id, accountId: input.accountId, status: "running", version, updatedAt: input.now, result: null, claimed: true };
  } catch (error) { exec("ROLLBACK;"); throw error; }
}

export function saveAccountInferenceSuggestions(input: { accountId: number; jobId: number; result: AccountCategoryInferenceResult; now: number }): void {
  requireOwnedAccount(input.accountId);
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated owner context required");
  exec("BEGIN IMMEDIATE;");
  try {
    const job = rows<{ version: number; status: string }>(`SELECT version,status FROM account_category_inference_jobs WHERE id=${sqlNumber(input.jobId)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)};`)[0];
    if (!job || job.status !== "running") throw new Error("inference job is not claimable");
    for (const suggestion of input.result.suggestions) {
      if (!getCategoriesForAccount(input.accountId).some((category) => category.id === suggestion.categoryId && category.slug === suggestion.slug)) throw new Error("suggested category is unavailable");
      exec(`INSERT OR IGNORE INTO account_category_inferences(job_id,owner_user_id,account_id,category_id,confidence,evidence_json,inference_version,suggested_at)
        VALUES(${sqlNumber(input.jobId)},${sqlString(owner)},${sqlNumber(input.accountId)},${sqlNumber(suggestion.categoryId)},${sqlNumber(suggestion.confidence)},${sqlString(JSON.stringify(suggestion.evidence))},${sqlNumber(job.version)},${sqlNumber(input.now)});`);
    }
    exec(`UPDATE account_category_inference_jobs SET status=${sqlString(input.result.status)},result_json=${sqlString(JSON.stringify(input.result))},updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.jobId)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)};`);
    exec("COMMIT;");
  } catch (error) { exec("ROLLBACK;"); throw error; }
}

export function acceptAccountCategoryInference(input: { accountId: number; categoryIds: number[]; weights?: Record<string, number>; now: number }): AccountCategoryConfig[] {
  requireOwnedAccount(input.accountId);
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated owner context required");
  const selected = [...new Set(input.categoryIds)].slice(0, 12);
  for (const [id, weight] of Object.entries(input.weights || {})) if (selected.includes(Number(id)) && (!Number.isFinite(weight) || weight < 0 || weight > 10)) throw new Error("category weight is invalid");
  const latest = rows<{ id: number; content_language: string }>(`SELECT id,json_extract(result_json,'$.contentLanguage') content_language FROM account_category_inference_jobs
    WHERE owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)} AND status IN ('ready','insufficient_evidence') ORDER BY version DESC LIMIT 1;`)[0];
  if (!latest) throw new Error("no category suggestions are ready");
  const valid = rows<{ category_id: number }>(`SELECT category_id FROM account_category_inferences WHERE job_id=${sqlNumber(latest.id)} AND owner_user_id=${sqlString(owner)} AND account_id=${sqlNumber(input.accountId)} AND rejected_at IS NULL;`).map((row) => row.category_id);
  const catalog = new Set(getCategoriesForAccount(input.accountId).filter((category) => category.enabled).map((category) => category.id));
  if (!selected.every((id) => catalog.has(id))) throw new Error("selected category is unavailable");
  exec("BEGIN IMMEDIATE;");
  try {
    const primary = rows<{ category_id: number; source: string; user_modified_at: number | null }>(`SELECT category_id,source,user_modified_at FROM account_categories WHERE account_id=${sqlNumber(input.accountId)} AND is_primary=1 LIMIT 1;`)[0];
    const preservePrimary = Boolean(primary && (primary.source !== "inferred" || primary.user_modified_at !== null));
    if (!preservePrimary) exec(`UPDATE account_categories SET is_primary=0 WHERE account_id=${sqlNumber(input.accountId)} AND source='inferred' AND user_modified_at IS NULL;`);
    let primaryAssigned = preservePrimary;
    for (let index = 0; index < selected.length; index += 1) {
      const categoryId = selected[index];
      const existing = rows<{ source: string; user_modified_at: number | null }>(`SELECT source,user_modified_at FROM account_categories WHERE account_id=${sqlNumber(input.accountId)} AND category_id=${sqlNumber(categoryId)};`)[0];
      const inferred = valid.includes(categoryId);
      const weight = Number(input.weights?.[String(categoryId)] ?? 1);
      const makePrimary = !primaryAssigned && (!existing || (existing.source === "inferred" && existing.user_modified_at === null));
      if (!existing) exec(`INSERT INTO account_categories(account_id,category_id,enabled,is_primary,weight,priority,source,user_modified_at)
        VALUES(${sqlNumber(input.accountId)},${sqlNumber(categoryId)},1,${sqlBool(makePrimary)},${weight},${sqlNumber(selected.length-index)},${sqlString(inferred ? "inferred" : "manual")},${inferred ? "NULL" : sqlNumber(input.now)});`);
      else if (existing.source === "inferred" && existing.user_modified_at === null) exec(`UPDATE account_categories SET is_primary=${sqlBool(makePrimary || (preservePrimary && primary?.category_id === categoryId))},priority=${sqlNumber(selected.length-index)},weight=${weight} WHERE account_id=${sqlNumber(input.accountId)} AND category_id=${sqlNumber(categoryId)} AND source='inferred' AND user_modified_at IS NULL;`);
      if (makePrimary) primaryAssigned = true;
      exec(`UPDATE account_category_inferences SET accepted_at=${sqlNumber(input.now)} WHERE job_id=${sqlNumber(latest.id)} AND category_id=${sqlNumber(categoryId)} AND owner_user_id=${sqlString(owner)} AND accepted_at IS NULL;`);
    }
    const rejected = valid.filter((id) => !selected.includes(id));
    for (const id of rejected) exec(`UPDATE account_category_inferences SET rejected_at=${sqlNumber(input.now)} WHERE job_id=${sqlNumber(latest.id)} AND category_id=${sqlNumber(id)} AND owner_user_id=${sqlString(owner)} AND rejected_at IS NULL;`);
    const account = getAccounts().find((item) => item.id === input.accountId);
    if (account) {
      const styleProfile = { ...account.styleProfile };
      if (!styleProfile.contentLocale && latest.content_language !== "unknown") styleProfile.contentLocale = latest.content_language;
      const selectedCategories = getCategories().filter((category) => selected.includes(category.id));
      if (!Array.isArray(styleProfile.categories)) styleProfile.categories = selectedCategories.map((category) => category.slug);
      else styleProfile.categories = [...new Set([...styleProfile.categories.map(String), ...selectedCategories.map((category) => category.slug)])].slice(0, 12);
      if (!Array.isArray(styleProfile.preferredFormats)) styleProfile.preferredFormats = [...new Set(selectedCategories.flatMap((category) => category.defaultFormats))].slice(0, 4);
      saveAccount({ id: account.id, accountKey: account.accountKey, handle: account.handle, displayName: account.displayName,
        enabled: account.enabled, defaultAccount: account.defaultAccount, automationMode: account.automationMode,
        dailyLimit: account.dailyLimit, capabilities: account.capabilities, styleProfile, skipCategorySync: true, now: input.now });
    }
    exec("COMMIT;");
  } catch (error) { exec("ROLLBACK;"); throw error; }
  return getAccountCategoryConfigs(input.accountId);
}

export function getSourceCategoryConfigs(sourceHandle?: string): SourceCategoryConfig[] {
  const where = sourceHandle ? `WHERE mapping.source_handle=${sqlString(sourceHandle)}` : "";
  return rows<{
    source_handle: string; category_id: number; slug: string; name: string; monitoring_tier: string; discovery_weight: number;
    category_reputation: number | null; enabled: number; last_evidence_at: number;
  }>(`SELECT mapping.source_handle, mapping.category_id, categories.slug, categories.name, mapping.monitoring_tier,
      mapping.discovery_weight, mapping.category_reputation, mapping.enabled, mapping.last_evidence_at
    FROM source_categories mapping JOIN categories ON categories.id=mapping.category_id ${where}
    ORDER BY mapping.enabled DESC, mapping.monitoring_tier ASC, categories.slug ASC;`).map((item) => ({
    sourceHandle: item.source_handle,
    categoryId: item.category_id,
    categorySlug: item.slug,
    categoryName: item.name,
    monitoringTier: item.monitoring_tier === "A" || item.monitoring_tier === "B" ? item.monitoring_tier : "C",
    discoveryWeight: item.discovery_weight,
    categoryReputation: item.category_reputation,
    enabled: Boolean(item.enabled),
    lastEvidenceAt: item.last_evidence_at,
  }));
}

export function getAccountSources(accountId: number): SourceConfig[] {
  requireValidOptionalAccount(accountId);
  if (!getAccounts().some((account) => account.id === accountId)) throw new Error("account not found");
  return rows<{ handle: string; canonical_name: string; canonical_enabled: number; canonical_max_posts: number; canonical_rights_status: string; profile_json: string; enabled: number; max_posts: number; rights_status: string; name_override: string; niche: string; topics_json: string; tone: string; pinned: number }>(`
    SELECT source.handle, source.name AS canonical_name, source.enabled AS canonical_enabled, source.max_posts AS canonical_max_posts,
      source.rights_status AS canonical_rights_status, source.profile_json, selected.enabled, selected.max_posts, selected.rights_status,
      selected.name_override, selected.niche, selected.topics_json, selected.tone, selected.pinned
    FROM account_sources selected JOIN sources source ON source.handle=selected.source_handle
    WHERE selected.account_id=${sqlNumber(accountId)} ORDER BY selected.name_override COLLATE NOCASE, source.handle;
  `).map((row) => {
    const profile = parseObject(row.profile_json) as SourceProfile;
    let topics: string[] = [];
    try { const parsed: unknown = JSON.parse(row.topics_json); if (Array.isArray(parsed)) topics = parsed.filter((value): value is string => typeof value === "string"); } catch { topics = []; }
    return {
      handle: row.handle,
      name: row.name_override || row.canonical_name,
      enabled: Boolean(row.enabled),
      maxPosts: row.max_posts,
      rightsStatus: row.rights_status === "cleared" || row.rights_status === "prohibited" ? row.rights_status : "unknown",
      profile: { ...profile, niche: row.niche || undefined, topics: topics.length ? topics : undefined, tone: row.tone || undefined, pinned: Boolean(row.pinned) },
    };
  });
}

export function addAccountSource(accountId: number, sourceHandle: string): SourceConfig {
  requireValidOptionalAccount(accountId);
  const sourceHandleNormalized = sourceHandle.replace(/^@/, "").toLocaleLowerCase("en-US");
  if (!getStoredSources().some((source) => source.handle === sourceHandleNormalized)) throw new Error("source not found");
  exec(`INSERT OR IGNORE INTO account_sources(account_id,source_handle,enabled,max_posts,rights_status)
    SELECT ${sqlNumber(accountId)},handle,enabled,max_posts,rights_status FROM sources WHERE handle=${sqlString(sourceHandleNormalized)};`);
  const selected = getAccountSources(accountId).find((source) => source.handle === sourceHandleNormalized);
  if (!selected) throw new Error("source selection failed");
  return selected;
}

export function isAccountSourceSelected(accountId: number, sourceHandle: string): boolean {
  requireValidOptionalAccount(accountId);
  return criticalRows<{ count: number }>(`SELECT COUNT(*) AS count FROM account_sources WHERE account_id=${sqlNumber(accountId)} AND source_handle=${sqlString(sourceHandle.replace(/^@/, "").toLocaleLowerCase("en-US"))};`)[0]?.count > 0;
}

export function updateAccountSource(input: { accountId: number; sourceHandle: string; name?: string; enabled?: boolean; maxPosts?: number; rightsStatus?: SourceConfig["rightsStatus"]; niche?: string; topics?: string[]; tone?: string; pinned?: boolean }): SourceConfig {
  requireValidOptionalAccount(input.accountId);
  const handle = input.sourceHandle.replace(/^@/, "").toLocaleLowerCase("en-US");
  if (!isAccountSourceSelected(input.accountId, handle)) throw new Error("source not selected for account");
  if (input.maxPosts !== undefined && (!Number.isInteger(input.maxPosts) || input.maxPosts < 1 || input.maxPosts > 50)) throw new Error("max posts invalid");
  if (input.name !== undefined && (!input.name.trim() || input.name.length > 120)) throw new Error("source name invalid");
  if (input.rightsStatus !== undefined && !["cleared", "unknown", "prohibited"].includes(input.rightsStatus)) throw new Error("source rights invalid");
  const topics = input.topics?.map((value) => value.trim()).filter(Boolean).slice(0, 30);
  exec(`UPDATE account_sources SET
    name_override=${input.name === undefined ? "name_override" : sqlString(input.name.trim())},
    enabled=${input.enabled === undefined ? "enabled" : sqlBool(input.enabled)},
    max_posts=${input.maxPosts === undefined ? "max_posts" : sqlNumber(input.maxPosts)},
    rights_status=${input.rightsStatus === undefined ? "rights_status" : sqlString(input.rightsStatus)},
    niche=${input.niche === undefined ? "niche" : sqlString(input.niche.trim().slice(0, 120))},
    topics_json=${topics === undefined ? "topics_json" : sqlString(JSON.stringify(topics))},
    tone=${input.tone === undefined ? "tone" : sqlString(input.tone.trim().slice(0, 120))},
    pinned=${input.pinned === undefined ? "pinned" : sqlBool(input.pinned)}
    WHERE account_id=${sqlNumber(input.accountId)} AND source_handle=${sqlString(handle)};`);
  const source = getAccountSources(input.accountId).find((item) => item.handle === handle);
  if (!source) throw new Error("account source update failed");
  return source;
}

export function removeAccountSource(accountId: number, sourceHandle: string): void {
  requireValidOptionalAccount(accountId);
  const handle = sourceHandle.replace(/^@/, "").toLocaleLowerCase("en-US");
  exec(`DELETE FROM account_sources WHERE account_id=${sqlNumber(accountId)} AND source_handle=${sqlString(handle)};`);
}

export function clearAccountSources(accountId: number): void {
  requireValidOptionalAccount(accountId);
  exec(`DELETE FROM account_sources WHERE account_id=${sqlNumber(accountId)};`);
}

export function getAccountSourceCategoryConfigs(accountId?: number): SourceCategoryConfig[] {
  if (accountId !== undefined) requireValidOptionalAccount(accountId);
  const ownerAccounts = currentOwnerId() === undefined ? null : getAccounts().map((account) => account.id);
  if (accountId !== undefined && !getAccounts().some((account) => account.id === accountId)) throw new Error("account not found");
  const selectedIds = accountId !== undefined ? [accountId] : ownerAccounts;
  if (selectedIds && selectedIds.length === 0) return [];
  const where = selectedIds ? `WHERE mapping.account_id IN (${selectedIds.map(sqlNumber).join(",")})` : "";
  return rows<{ account_id: number; source_handle: string; category_id: number; slug: string; name: string; monitoring_tier: string; discovery_weight: number; category_reputation: number | null; enabled: number; last_evidence_at: number }>(`
    SELECT mapping.account_id,mapping.source_handle,mapping.category_id,categories.slug,categories.name,mapping.monitoring_tier,
      mapping.discovery_weight,mapping.category_reputation,mapping.enabled,mapping.last_evidence_at
    FROM account_source_categories mapping JOIN categories ON categories.id=mapping.category_id ${where}
    ORDER BY mapping.enabled DESC,mapping.monitoring_tier ASC,categories.slug ASC;
  `).map((row) => ({ accountId: row.account_id, sourceHandle: row.source_handle, categoryId: row.category_id, categorySlug: row.slug, categoryName: row.name,
    monitoringTier: row.monitoring_tier === "A" || row.monitoring_tier === "B" ? row.monitoring_tier : "C", discoveryWeight: row.discovery_weight,
    categoryReputation: row.category_reputation, enabled: Boolean(row.enabled), lastEvidenceAt: row.last_evidence_at }));
}

export function saveAccountSourceCategoryConfig(input: Omit<SourceCategoryConfig, "categorySlug" | "categoryName"> & { accountId: number }): SourceCategoryConfig {
  requireValidOptionalAccount(input.accountId);
  if (!getAccountSources(input.accountId).some((source) => source.handle === input.sourceHandle)) throw new Error("source not selected for account");
  if (!getAccountCategoryConfigs(input.accountId).some((category) => category.categoryId === input.categoryId && category.enabled)) throw new Error("category not enabled for account");
  if (!getCategories().some((category) => category.id === input.categoryId)) throw new Error("category not found");
  if (!["A", "B", "C"].includes(input.monitoringTier)) throw new Error("monitoring tier invalid");
  if (!Number.isFinite(input.discoveryWeight) || input.discoveryWeight < 0 || input.discoveryWeight > 10) throw new Error("discovery weight invalid");
  if (input.categoryReputation !== null && (!Number.isFinite(input.categoryReputation) || input.categoryReputation < 0 || input.categoryReputation > 100)) throw new Error("category reputation invalid");
  if (!Number.isInteger(input.lastEvidenceAt) || input.lastEvidenceAt < 0) throw new Error("last evidence invalid");
  exec(`INSERT INTO account_source_categories(account_id,source_handle,category_id,monitoring_tier,discovery_weight,category_reputation,enabled,last_evidence_at)
    VALUES(${sqlNumber(input.accountId)},${sqlString(input.sourceHandle)},${sqlNumber(input.categoryId)},${sqlString(input.monitoringTier)},${sqlNumber(input.discoveryWeight)},
      ${input.categoryReputation === null ? "NULL" : sqlNumber(input.categoryReputation)},${sqlBool(input.enabled)},${sqlNumber(input.lastEvidenceAt)})
    ON CONFLICT(account_id,source_handle,category_id) DO UPDATE SET monitoring_tier=excluded.monitoring_tier,discovery_weight=excluded.discovery_weight,
      category_reputation=excluded.category_reputation,enabled=excluded.enabled,last_evidence_at=excluded.last_evidence_at;`);
  const result = getAccountSourceCategoryConfigs(input.accountId).find((item) => item.sourceHandle === input.sourceHandle && item.categoryId === input.categoryId);
  if (!result) throw new Error("account source category update failed");
  return result;
}

export function deleteAccountSourceCategoryConfig(accountId: number, sourceHandle: string, categoryId: number): void {
  requireValidOptionalAccount(accountId);
  exec(`DELETE FROM account_source_categories WHERE account_id=${sqlNumber(accountId)} AND source_handle=${sqlString(sourceHandle.replace(/^@/, "").toLocaleLowerCase("en-US"))} AND category_id=${sqlNumber(categoryId)};`);
}

export function saveSourceCategoryConfig(input: Omit<SourceCategoryConfig, "categorySlug" | "categoryName">): SourceCategoryConfig {
  if (!getStoredSources().some((source) => source.handle === input.sourceHandle)) throw new Error("kaynak bulunamadı");
  const category = getCategories().find((item) => item.id === input.categoryId);
  if (!category || category.ownerUserId || category.accountId != null) throw new Error("hesaba özel kategoriler ortak kaynaklara eklenemez");
  if (!["A", "B", "C"].includes(input.monitoringTier)) throw new Error("monitoring tier geçersiz");
  if (!Number.isFinite(input.discoveryWeight) || input.discoveryWeight < 0 || input.discoveryWeight > 10) throw new Error("discovery weight geçersiz");
  if (input.categoryReputation !== null && (!Number.isFinite(input.categoryReputation) || input.categoryReputation < 0 || input.categoryReputation > 100)) throw new Error("category reputation geçersiz");
  if (!Number.isInteger(input.lastEvidenceAt) || input.lastEvidenceAt < 0) throw new Error("last evidence geçersiz");
  exec(`INSERT INTO source_categories (
      source_handle, category_id, monitoring_tier, discovery_weight, category_reputation, enabled, last_evidence_at
    ) VALUES (
      ${sqlString(input.sourceHandle)}, ${sqlNumber(input.categoryId)}, ${sqlString(input.monitoringTier)},
      ${sqlNumber(input.discoveryWeight)}, ${input.categoryReputation === null ? "NULL" : sqlNumber(input.categoryReputation)},
      ${sqlBool(input.enabled)}, ${sqlNumber(input.lastEvidenceAt)}
    ) ON CONFLICT(source_handle, category_id) DO UPDATE SET
      monitoring_tier=excluded.monitoring_tier, discovery_weight=excluded.discovery_weight,
      category_reputation=excluded.category_reputation, enabled=excluded.enabled,
      last_evidence_at=excluded.last_evidence_at;`);
  const result = getSourceCategoryConfigs(input.sourceHandle).find((item) => item.categoryId === input.categoryId);
  if (!result) throw new Error("source category kaydedilemedi");
  return result;
}

function categoryStrings(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

export function saveCategory(input: Omit<CategoryDefinition, "id" | "createdAt" | "updatedAt"> & { id?: number; now: number }): CategoryDefinition {
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim().slice(0, 120);
  const description = input.description.trim().slice(0, 2_000);
  const positiveExamples = categoryStrings(input.positiveExamples, 20);
  const negativeExamples = categoryStrings(input.negativeExamples, 20);
  const keywords = categoryStrings(input.keywords, 50);
  const excludedKeywords = categoryStrings(input.excludedKeywords, 50);
  const seedHandles = categoryStrings(input.seedHandles.map((handle) => handle.replace(/^@/, "").toLowerCase()), 50);
  const defaultFormats = categoryStrings(input.defaultFormats, 8);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("category slug geçersiz");
  if (!name || !description) throw new Error("category ad ve açıklama gerekli");
  if (!CATEGORY_BASE_STRATEGIES.includes(input.baseStrategy) || !CATEGORY_CLUSTER_STRATEGIES.includes(input.clusterStrategy) || !CATEGORY_VERIFICATION_MODES.includes(input.verificationMode)) throw new Error("category strategy geçersiz");
  if (!input.builtIn && positiveExamples.length + negativeExamples.length + keywords.length + seedHandles.length === 0) throw new Error("custom category için en az bir tanımlayıcı sinyal gerekli");
  if (input.verificationMode === "none" && (input.baseStrategy === "news" || input.baseStrategy === "politics" || input.baseStrategy === "finance")) throw new Error("factual category doğrulamasız çalışamaz");
  const id = input.id && Number.isInteger(input.id) ? input.id : 0;
  const ownerId = input.builtIn ? null : (input.ownerUserId ?? currentOwnerId() ?? null);
  const accountId = input.accountId ?? null;
  if (!input.builtIn && !ownerId) throw new Error("authenticated owner context required");
  if (accountId !== null && (!Number.isSafeInteger(accountId) || !getAccounts().some((account) => account.id === accountId && account.ownerUserId === ownerId))) throw new Error("category account owner mismatch");
  if (id) {
    const existing = categoryRows().find((category) => category.id === id);
    if (!existing || (existing.ownerUserId && existing.ownerUserId !== ownerId) || (existing.accountId != null && existing.accountId !== accountId)) throw new Error("category owner mismatch");
  }
  const fields = `slug=${sqlString(slug)}, name=${sqlString(name)}, enabled=${sqlBool(input.enabled)}, built_in=${sqlBool(input.builtIn)},
    base_strategy=${sqlString(input.baseStrategy)}, cluster_strategy=${sqlString(input.clusterStrategy)}, verification_mode=${sqlString(input.verificationMode)},
    description=${sqlString(description)}, positive_examples_json=${sqlString(JSON.stringify(positiveExamples))}, negative_examples_json=${sqlString(JSON.stringify(negativeExamples))},
    keywords_json=${sqlString(JSON.stringify(keywords))}, excluded_keywords_json=${sqlString(JSON.stringify(excludedKeywords))}, seed_handles_json=${sqlString(JSON.stringify(seedHandles))},
    default_formats_json=${sqlString(JSON.stringify(defaultFormats.length ? defaultFormats : ["post"]))}, source_policy_json=${sqlString(JSON.stringify(input.sourcePolicy))},
    risk_policy_json=${sqlString(JSON.stringify(input.riskPolicy))}, scoring_policy_json=${sqlString(JSON.stringify(input.scoringPolicy))},
    publishing_policy_json=${sqlString(JSON.stringify(input.publishingPolicy))}, ai_context=${sqlString(input.aiContext.slice(0, 8_000))}, updated_at=${sqlNumber(input.now)}`;
  if (id) exec(`UPDATE categories SET ${fields} WHERE id=${sqlNumber(id)};`);
  else exec(`INSERT INTO categories (
    slug, name, enabled, built_in, base_strategy, cluster_strategy, verification_mode, description,
    positive_examples_json, negative_examples_json, keywords_json, excluded_keywords_json, seed_handles_json,
    default_formats_json, source_policy_json, risk_policy_json, scoring_policy_json, publishing_policy_json,
    ai_context, created_at, updated_at, owner_user_id, account_id
  ) VALUES (
    ${sqlString(slug)}, ${sqlString(name)}, ${sqlBool(input.enabled)}, ${sqlBool(input.builtIn)},
    ${sqlString(input.baseStrategy)}, ${sqlString(input.clusterStrategy)}, ${sqlString(input.verificationMode)}, ${sqlString(description)},
    ${sqlString(JSON.stringify(positiveExamples))}, ${sqlString(JSON.stringify(negativeExamples))}, ${sqlString(JSON.stringify(keywords))},
    ${sqlString(JSON.stringify(excludedKeywords))}, ${sqlString(JSON.stringify(seedHandles))}, ${sqlString(JSON.stringify(defaultFormats.length ? defaultFormats : ["post"]))},
    ${sqlString(JSON.stringify(input.sourcePolicy))}, ${sqlString(JSON.stringify(input.riskPolicy))}, ${sqlString(JSON.stringify(input.scoringPolicy))},
    ${sqlString(JSON.stringify(input.publishingPolicy))}, ${sqlString(input.aiContext.slice(0, 8_000))}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)},
    ${ownerId === null ? "NULL" : sqlString(ownerId)}, ${accountId === null ? "NULL" : sqlNumber(accountId)}
  );`);
  const category = categoryRows().find((item) => id ? item.id === id : item.slug === slug);
  if (!category) throw new Error("category kaydedilemedi");
  return category;
}

/** Create or update a custom category owned by one of the caller's X accounts. */
export function saveAccountCategory(input: Omit<CategoryDefinition, "id" | "createdAt" | "updatedAt" | "ownerUserId" | "accountId"> & { id?: number; accountId: number; now: number }): CategoryDefinition {
  requireOwnedAccount(input.accountId);
  const ownerUserId = currentOwnerId();
  if (!ownerUserId) throw new Error("authenticated owner context required");
  if (input.builtIn) throw new Error("built-in categories are read-only");
  if (input.id) {
    const existing = categoryRows().find((category) => category.id === input.id);
    if (!existing || existing.builtIn || existing.ownerUserId !== ownerUserId || existing.accountId !== input.accountId) throw new Error("category owner/account mismatch");
  }
  const prefix = `account-${input.accountId}-`;
  const slug = input.slug.startsWith(prefix) ? input.slug : `${prefix}${input.slug}`;
  const category = saveCategory({ ...input, slug, builtIn: false, ownerUserId, accountId: input.accountId });
  const existingConfig = getAccountCategoryConfigs(input.accountId).find((config) => config.categoryId === category.id);
  const enabled = category.enabled;
  const makePrimary = enabled && (!existingConfig || !getAccountCategoryConfigs(input.accountId).some((config) => config.enabled && config.primary));
  saveAccountCategoryConfig({ accountId: input.accountId, categoryId: category.id, enabled, primary: existingConfig?.primary && enabled || makePrimary,
    weight: existingConfig?.weight ?? 1, priority: existingConfig?.priority ?? 1, publishThreshold: existingConfig?.publishThreshold ?? null,
    dailyBudget: existingConfig?.dailyBudget ?? null, styleOverride: existingConfig?.styleOverride ?? {}, aiRouteOverride: existingConfig?.aiRouteOverride ?? {} });
  return category;
}

export function deleteAccountCategory(id: number): boolean {
  const ownerUserId = currentOwnerId();
  const category = categoryRows().find((item) => item.id === id);
  if (!ownerUserId || !category || category.builtIn || category.ownerUserId !== ownerUserId || category.accountId == null) return false;
  requireOwnedAccount(category.accountId);
  return deleteCategory(id);
}

export function saveGeneratedAccountCategory(input: { accountId: number; name: string; slug: string; description: string; keywords: string[]; examples: string[]; now: number }): CategoryDefinition {
  requireOwnedAccount(input.accountId);
  const ownerId = currentOwnerId();
  if (!ownerId) throw new Error("authenticated owner context required");
  const slug = `account-${input.accountId}-${input.slug}`.slice(0, 80).replace(/-+$/u, "");
  const existing = getCategoriesForAccount(input.accountId).find((category) => category.ownerUserId === ownerId && category.accountId === input.accountId && category.slug === slug);
  if (existing) return existing;
  return saveCategory({
    slug, name: input.name, enabled: true, builtIn: false, ownerUserId: ownerId, accountId: input.accountId,
    baseStrategy: "generic", clusterStrategy: "topic", verificationMode: "moderate",
    description: input.description, positiveExamples: input.examples.slice(0, 5), negativeExamples: [],
    keywords: input.keywords.slice(0, 8), excludedKeywords: [], seedHandles: [], defaultFormats: ["post"],
    sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: input.description, now: input.now,
  });
}

export function getStoredSources(): SourceConfig[] {
  return rows<{
    handle: string;
    name: string;
    enabled: number;
    max_posts: number;
    rights_status: string;
    profile_json: string;
  }>(`SELECT handle, name, enabled, max_posts, rights_status, profile_json
      FROM sources ORDER BY handle;`).map((source) => ({
    handle: source.handle,
    name: source.name,
    enabled: source.enabled === 1,
    maxPosts: source.max_posts,
    rightsStatus: source.rights_status === "cleared" || source.rights_status === "prohibited" ? source.rights_status : "unknown",
    profile: parseObject(source.profile_json),
  }));
}

export function deleteSource(handle: string): void {
  command("BEGIN IMMEDIATE;");
  try {
    exec(`DELETE FROM source_categories WHERE source_handle=${sqlString(handle)};
      DELETE FROM source_reader_cursors WHERE source_handle=${sqlString(handle)};
      DELETE FROM sources WHERE handle=${sqlString(handle)};`);
    command("COMMIT;");
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function sourceHasLatestEvent(handle: string, event: string): boolean {
  return rows<{ event: string }>(`SELECT event FROM source_events WHERE handle=${sqlString(handle)} ORDER BY id DESC LIMIT 1;`)[0]?.event === event;
}

export function resetSourceRegistry(): void {
  command("BEGIN IMMEDIATE;");
  try {
    exec(`DELETE FROM sources;
      DELETE FROM source_categories;
      DELETE FROM source_reader_cursors;
      DELETE FROM app_settings WHERE name IN ('sources_seed_v1', 'sources_political_v2', 'sources_ai_pool_v1', 'sources_ai_pool_v2', 'sources_ai_pool_v3');`);
    command("COMMIT;");
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function recordSourceRestorations(handles: string[], now: number): void {
  if (!handles.length) return;
  const list = handles.map(sqlString).join(", ");
  exec(`INSERT INTO source_events (handle, event, score, reason, model, created_at)
    SELECT candidate.handle, 'restored', candidate.score, 'source registry reset', candidate.model, ${sqlNumber(now)}
    FROM source_events AS candidate
    WHERE candidate.handle IN (${list}) AND candidate.event='deleted'
      AND candidate.id=(SELECT MAX(latest.id) FROM source_events AS latest WHERE latest.handle=candidate.handle);`);
}

export function recordSourceEvent(input: {
  handle: string;
  event: string;
  score: number;
  reason: string;
  model: string;
  now: number;
}): void {
  exec(`INSERT INTO source_events (handle, event, score, reason, model, created_at)
    VALUES (${sqlString(input.handle)}, ${sqlString(input.event)}, ${sqlNumber(input.score)},
      ${sqlString(input.reason)}, ${sqlString(input.model)}, ${sqlNumber(input.now)});`);
}

export function sourceWasDeletedSince(handle: string, since: number): boolean {
  return (rows<{ count: number }>(`SELECT COUNT(*) as count FROM source_events
    WHERE handle=${sqlString(handle)} AND event='deleted' AND created_at >= ${sqlNumber(since)};`)[0]?.count || 0) > 0;
}

function isTechnicalSourceWarning(reason: string): boolean {
  return /(?:feed )?profil kimliği (?:eşleşmedi|doğrulanamadı)|profil 404/iu.test(reason);
}

function latestSourceEvents(events: string, limit: number): DeletedSource[] {
  return rows<DeletedSource>(`SELECT handle, score, reason, model, created_at as deletedAt
    FROM source_events AS candidate WHERE event IN (${events})
    AND id = (SELECT MAX(latest.id) FROM source_events AS latest WHERE latest.handle=candidate.handle)
    ORDER BY created_at DESC LIMIT ${sqlNumber(limit)};`);
}

export function getDeletedSources(limit = 100): DeletedSource[] {
  return latestSourceEvents("'deleted'", limit).filter((item) => !isTechnicalSourceWarning(item.reason));
}

export function getTechnicalSourceWarnings(limit = 100): DeletedSource[] {
  return latestSourceEvents("'deleted', 'identity_warning'", limit).filter((item) => isTechnicalSourceWarning(item.reason));
}

export function sourceFeedbackScore(handle: string): number | null {
  const samples = rows<{ likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
    SELECT feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views
    FROM feedback_snapshots AS feedback
    INNER JOIN (
      SELECT post_external_id, MAX(captured_at) AS captured_at
      FROM feedback_snapshots GROUP BY post_external_id
    ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    INNER JOIN observed_posts AS post ON post.external_id=feedback.post_external_id
    WHERE post.source_handle=${sqlString(handle)}
    ORDER BY feedback.captured_at DESC LIMIT 20;
  `);
  return historicalPerformanceScore(samples);
}

export function accountFeedbackScore(accountId: number): number | null {
  requireOwnedAccount(accountId);
  const samples = rows<{ likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
    SELECT DISTINCT feedback.id, feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views
    FROM publish_attempts AS attempt
    INNER JOIN feedback_snapshots AS feedback ON feedback.post_external_id=attempt.post_external_id
    INNER JOIN (
      SELECT post_external_id, MAX(captured_at) AS captured_at
      FROM feedback_snapshots GROUP BY post_external_id
    ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    WHERE attempt.account_id=${sqlNumber(accountId)} AND attempt.status='confirmed'
    ORDER BY feedback.captured_at DESC LIMIT 20;
  `);
  return historicalPerformanceScore(samples);
}

export function accountCategoryFeedbackScore(accountId: number, categories: string[]): number | null {
  requireOwnedAccount(accountId);
  const wanted = new Set(categories.map((item) => item.trim().toLocaleLowerCase("tr-TR")).filter(Boolean));
  if (!wanted.size) return accountFeedbackScore(accountId);
  const samples = rows<{ likes: number; replies: number; reposts: number; quotes: number; views: number; score_reason: string }>(`
    SELECT feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views, observed_posts.score_reason
    FROM publish_attempts AS attempt
    INNER JOIN feedback_snapshots AS feedback ON feedback.post_external_id=attempt.post_external_id
    INNER JOIN (
      SELECT post_external_id, MAX(captured_at) AS captured_at FROM feedback_snapshots GROUP BY post_external_id
    ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    LEFT JOIN observed_posts ON observed_posts.external_id=attempt.post_external_id
    WHERE attempt.account_id=${sqlNumber(accountId)} AND attempt.status='confirmed'
    ORDER BY feedback.captured_at DESC LIMIT 40;
  `).filter((sample) => scoreEvidenceFor(sample.score_reason, 0).categories.some((category) => wanted.has(category.toLocaleLowerCase("tr-TR"))));
  return samples.length >= 5 ? historicalPerformanceScore(samples) : accountFeedbackScore(accountId);
}

function subscriptionHistoryFor(accountId: number): AccountSubscriptionEvent[] {
  return rows<{ id: number; tier: string; effective_at: number; created_at: number; updated_at: number }>(`SELECT id, tier, effective_at, created_at, updated_at
    FROM account_subscription_events WHERE account_id=${sqlNumber(accountId)} ORDER BY effective_at ASC, id ASC;`).map((event) => ({
    id: event.id,
    tier: SUBSCRIPTION_TIERS.includes(event.tier as SubscriptionTier) ? event.tier as SubscriptionTier : "unknown",
    effectiveAt: event.effective_at,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  }));
}

function subscriptionStateFor(accountId: number): AccountSubscriptionState {
  const state = rows<{ tier: string; observed_at: number; history_complete: number }>(`SELECT tier, observed_at, history_complete
    FROM account_subscription_state WHERE account_id=${sqlNumber(accountId)} LIMIT 1;`)[0];
  return {
    tier: state && SUBSCRIPTION_TIERS.includes(state.tier as SubscriptionTier) ? state.tier as SubscriptionTier : "unknown",
    observedAt: state?.observed_at || 0,
    historyComplete: state?.history_complete === 1,
  };
}

export function recordAccountSubscriptionSync(input: {
  accountId: number;
  tier: SubscriptionTier;
  observedAt: number;
  history?: Array<{ tier: SubscriptionTier; effectiveAt: number }>;
  historyComplete?: boolean;
}): void {
  requireOwnedAccount(input.accountId);
  const tier = SUBSCRIPTION_TIERS.includes(input.tier) ? input.tier : "unknown";
  const observedAt = Math.max(0, Math.floor(input.observedAt));
  const history = normaliseSubscriptionHistory(input.history || [], observedAt || Math.floor(Date.now() / 1000));
  command("BEGIN;");
  try {
    for (const event of history) command(`INSERT INTO account_subscription_events (account_id, tier, effective_at, created_at, updated_at)
      VALUES (${sqlNumber(input.accountId)}, ${sqlString(event.tier)}, ${sqlNumber(event.effectiveAt)}, ${sqlNumber(observedAt)}, ${sqlNumber(observedAt)})
      ON CONFLICT(account_id, effective_at) DO UPDATE SET tier=excluded.tier, updated_at=excluded.updated_at;`);
    command(`INSERT INTO account_subscription_state (account_id, tier, observed_at, history_complete)
      VALUES (${sqlNumber(input.accountId)}, ${sqlString(tier)}, ${sqlNumber(observedAt)}, ${sqlBool(input.historyComplete === true)})
      ON CONFLICT(account_id) DO UPDATE SET tier=excluded.tier, observed_at=excluded.observed_at,
        history_complete=excluded.history_complete;`);
    command("COMMIT;");
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

function normaliseSubscriptionHistory(value: unknown, now: number): Array<{ tier: SubscriptionTier; effectiveAt: number }> {
  if (!Array.isArray(value)) return [];
  const events = value.map((item) => object(item)).map((item) => ({
    tier: SUBSCRIPTION_TIERS.includes(String(item.tier) as SubscriptionTier) ? String(item.tier) as SubscriptionTier : "unknown" as SubscriptionTier,
    effectiveAt: Number(item.effectiveAt),
  })).filter((item) => Number.isInteger(item.effectiveAt) && item.effectiveAt > 0 && item.effectiveAt <= now);
  if (events.length !== value.length || events.length > 24) throw new Error("subscription geçmişi geçersiz");
  const timestamps = new Set<number>();
  for (const event of events) {
    if (timestamps.has(event.effectiveAt)) throw new Error("subscription başlangıç tarihi tekrarlanamaz");
    timestamps.add(event.effectiveAt);
  }
  return events.sort((left, right) => left.effectiveAt - right.effectiveAt);
}

function replaceSubscriptionHistory(accountId: number, value: unknown, now: number): void {
  const events = normaliseSubscriptionHistory(value, now);
  const timestamps = events.map((event) => sqlNumber(event.effectiveAt));
  command(`DELETE FROM account_subscription_events WHERE account_id=${sqlNumber(accountId)}${timestamps.length ? ` AND effective_at NOT IN (${timestamps.join(", ")})` : ""};`);
  for (const event of events) command(`INSERT INTO account_subscription_events (account_id, tier, effective_at, created_at, updated_at)
    VALUES (${sqlNumber(accountId)}, ${sqlString(event.tier)}, ${sqlNumber(event.effectiveAt)}, ${sqlNumber(now)}, ${sqlNumber(now)})
    ON CONFLICT(account_id, effective_at) DO UPDATE SET tier=excluded.tier, updated_at=excluded.updated_at;`);
}

export type AccountSubscriptionEvidence = {
  currentTier: SubscriptionTier;
  previousTier: SubscriptionTier | null;
  currentSamples: number;
  previousSamples: number;
  currentWeeks: number;
  previousWeeks: number;
  currentMedianViewsPerThousand: number | null;
  previousMedianViewsPerThousand: number | null;
  currentMedianEngagementPerThousand: number | null;
  previousMedianEngagementPerThousand: number | null;
  lift: number | null;
  bonus: number;
  eligible: boolean;
};

function isoWeek(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return `${date.getUTCFullYear()}-${String(1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000)).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function accountSubscriptionEvidence(accountId: number, now = Math.floor(Date.now() / 1000)): AccountSubscriptionEvidence {
  requireOwnedAccount(accountId);
  const history = subscriptionHistoryFor(accountId).filter((event) => event.effectiveAt <= now);
  const observed = subscriptionStateFor(accountId);
  const recordedCurrent = history.at(-1);
  const current = observed.tier === "unknown" || observed.tier === recordedCurrent?.tier ? recordedCurrent : undefined;
  const previous = current ? history.at(-2) : undefined;
  const empty: AccountSubscriptionEvidence = { currentTier: observed.tier === "unknown" ? recordedCurrent?.tier || "unknown" : observed.tier, previousTier: previous?.tier || null, currentSamples: 0, previousSamples: 0, currentWeeks: 0, previousWeeks: 0, currentMedianViewsPerThousand: null, previousMedianViewsPerThousand: null, currentMedianEngagementPerThousand: null, previousMedianEngagementPerThousand: null, lift: null, bonus: 0, eligible: false };
  if (!current || !previous || current.tier === previous.tier) return empty;
  const samples = rows<{ captured_at: number; followers: number | null; likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
    SELECT feedback.captured_at,
      (SELECT followers FROM account_metric_snapshots profile WHERE profile.account_id=attempt.account_id AND profile.captured_at <= feedback.captured_at ORDER BY profile.captured_at DESC LIMIT 1) AS followers,
      feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views
    FROM feedback_snapshots feedback INNER JOIN publish_attempts attempt ON attempt.post_external_id=feedback.post_external_id
    WHERE attempt.account_id=${sqlNumber(accountId)} AND attempt.status='confirmed' AND feedback.milestone='60dk'
      AND feedback.captured_at >= ${sqlNumber(previous.effectiveAt)};`);
  const summarize = (start: number, end: number | null) => {
    const cohort = samples.filter((sample) => sample.captured_at >= start && (end === null || sample.captured_at < end) && Number(sample.followers) > 0);
    return {
      samples: cohort.length,
      weeks: new Set(cohort.map((sample) => isoWeek(sample.captured_at))).size,
      views: median(cohort.map((sample) => sample.views / Number(sample.followers) * 1000)),
      engagement: median(cohort.map((sample) => (sample.likes + sample.replies + sample.reposts + sample.quotes) / Number(sample.followers) * 1000)),
    };
  };
  const prior = summarize(previous.effectiveAt, current.effectiveAt);
  const active = summarize(current.effectiveAt, null);
  const lift = active.views !== null && prior.views !== null && prior.views > 0 ? active.views / prior.views - 1 : null;
  const eligible = prior.samples >= 30 && active.samples >= 30 && prior.weeks >= 4 && active.weeks >= 4 && lift !== null && lift > 0;
  return { currentTier: current.tier, previousTier: previous.tier, currentSamples: active.samples, previousSamples: prior.samples, currentWeeks: active.weeks, previousWeeks: prior.weeks, currentMedianViewsPerThousand: active.views, previousMedianViewsPerThousand: prior.views, currentMedianEngagementPerThousand: active.engagement, previousMedianEngagementPerThousand: prior.engagement, lift, bonus: eligible ? Math.min(5, Math.round(lift * 5)) : 0, eligible };
}

export function getAccounts(): Account[] {
  return rows<{
    id: number;
    account_key: string;
    handle: string;
    display_name: string;
    enabled: number;
    default_account: number;
    automation_mode: string;
    daily_limit: number;
    capabilities_json: string;
    style_profile_json: string;
    owner_user_id: string | null;
    verification_status: string | null;
    updated_at: number;
  }>(`SELECT id, account_key, handle, display_name, enabled,
      default_account, automation_mode, daily_limit, capabilities_json,
      style_profile_json,
      owner_user_id,
      (SELECT verification_status FROM account_metric_snapshots profile WHERE profile.account_id=accounts.id ORDER BY profile.captured_at DESC LIMIT 1) AS verification_status,
      updated_at FROM accounts ${ownerSql("owner_user_id") ? `WHERE ${ownerSql("owner_user_id")}` : ""} ORDER BY default_account DESC, handle;`).map((account) => ({
    id: account.id,
    ownerUserId: account.owner_user_id as string | null,
    accountKey: account.account_key,
    handle: account.handle,
    displayName: account.display_name,
    enabled: account.enabled === 1,
    defaultAccount: account.default_account === 1,
    automationMode: account.automation_mode === "auto" ? "auto" : "manual",
    dailyLimit: account.daily_limit,
    capabilities: parseArray(account.capabilities_json),
    styleProfile: { ...DEFAULT_ACCOUNT_STYLE, ...parseObject(account.style_profile_json) },
    subscriptionHistory: subscriptionHistoryFor(account.id),
    subscriptionState: subscriptionStateFor(account.id),
    publicVerificationStatus: PUBLIC_VERIFICATION_STATUSES.includes(account.verification_status as PublicVerificationStatus) ? account.verification_status as PublicVerificationStatus : "unknown",
    updatedAt: account.updated_at,
  }));
}

export function saveAccount(input: {
  id?: number;
  accountKey: string;
  handle: string;
  displayName: string;
  enabled: boolean;
  defaultAccount: boolean;
  automationMode: "manual" | "auto";
  dailyLimit: number;
  capabilities: string[];
  styleProfile?: Record<string, unknown>;
  skipCategorySync?: boolean;
  subscriptionHistory?: unknown;
  now: number;
}): Account {
  if (input.id !== undefined && (!Number.isSafeInteger(input.id) || input.id < 1)) throw new Error("account id is invalid");
  const styleProfile = { ...(input.styleProfile || {}) };
  if ("editorialInstruction" in styleProfile) {
    const instruction = writeEditorialInstruction(styleProfile.editorialInstruction, "");
    if (instruction) styleProfile.editorialInstruction = instruction;
    else delete styleProfile.editorialInstruction;
  }
  let categorySelectionChanged = input.id === undefined && "categories" in styleProfile;
  if ("categories" in styleProfile) {
    const categories = canonicalCategorySlugs(styleProfile.categories);
    if (!categories) throw new Error("account kategorileri katalogdan seçilmeli");
    if (input.id && !categories.every((slug) => getCategoriesForAccount(input.id!).some((category) => category.slug === slug))) throw new Error("account kategorisi başka bir hesaba bağlı");
    styleProfile.categories = categories;
    if (input.id !== undefined) {
      const previous = getAccounts().find((account) => account.id === input.id);
      const previousCategories = Array.isArray(previous?.styleProfile.categories) ? previous.styleProfile.categories.map(String) : [];
      categorySelectionChanged = JSON.stringify(previousCategories) !== JSON.stringify(categories);
    }
  }
  if (input.defaultAccount) {
    exec(`UPDATE accounts SET default_account=0 ${ownerSql("owner_user_id") ? `WHERE ${ownerSql("owner_user_id")}` : ""};`);
  }
  const id = input.id && Number.isInteger(input.id) ? input.id : 0;
  if (id > 0) {
    requireOwnedAccount(id);
    exec(`UPDATE accounts SET account_key=${sqlString(input.accountKey)}, handle=${sqlString(input.handle)},
      display_name=${sqlString(input.displayName)},
      enabled=${sqlBool(input.enabled)}, default_account=${sqlBool(input.defaultAccount)},
      automation_mode=${sqlString(input.automationMode)}, daily_limit=${sqlNumber(input.dailyLimit)},
      capabilities_json=${sqlString(JSON.stringify(input.capabilities))},
      style_profile_json=${sqlString(JSON.stringify(styleProfile))}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(id)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""};`);
  } else {
    exec(`INSERT INTO accounts (account_key, handle, display_name, enabled,
      default_account, automation_mode, daily_limit, capabilities_json, style_profile_json, owner_user_id, updated_at)
      VALUES (${sqlString(input.accountKey)}, ${sqlString(input.handle)}, ${sqlString(input.displayName)},
      ${sqlBool(input.enabled)}, ${sqlBool(input.defaultAccount)},
      ${sqlString(input.automationMode)}, ${sqlNumber(input.dailyLimit)},
      ${sqlString(JSON.stringify(input.capabilities))}, ${sqlString(JSON.stringify(styleProfile))},
      ${currentOwnerId() === undefined ? "NULL" : sqlString(currentOwnerId()!)},
      ${sqlNumber(input.now)});`);
  }
  const savedId = id > 0 ? id : Number(rows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0]?.id);
  if (!savedId) throw new Error("account could not be saved");
  if (categorySelectionChanged && !input.skipCategorySync) syncManualAccountCategorySelection(savedId, styleProfile.categories as string[], input.now);
  if (input.subscriptionHistory !== undefined) replaceSubscriptionHistory(savedId, input.subscriptionHistory, input.now);
  const result = getAccounts().find((account) => account.id === savedId);
  if (!result) throw new Error("account could not be saved");
  return result;
}

function syncManualAccountCategorySelection(accountId: number, slugs: string[], now: number): void {
  const categoryIds = new Map(getCategories().map((category) => [category.slug, category.id]));
  const selected = slugs.map((slug) => categoryIds.get(slug)).filter((id): id is number => Number.isSafeInteger(id));
  const mappings = rows<{ category_id: number }>(`SELECT category_id FROM account_categories WHERE account_id=${sqlNumber(accountId)};`);
  const selectedSet = new Set(selected);
  exec("BEGIN IMMEDIATE;");
  try {
    exec(`UPDATE account_categories SET is_primary=0 WHERE account_id=${sqlNumber(accountId)};`);
    for (const mapping of mappings) if (!selectedSet.has(mapping.category_id)) exec(`UPDATE account_categories SET enabled=0,source='manual',user_modified_at=${sqlNumber(now)} WHERE account_id=${sqlNumber(accountId)} AND category_id=${sqlNumber(mapping.category_id)};`);
    for (let index = 0; index < selected.length; index += 1) {
      const categoryId = selected[index];
      const existing = mappings.some((mapping) => mapping.category_id === categoryId);
      if (existing) exec(`UPDATE account_categories SET enabled=1,is_primary=${sqlBool(index===0)},priority=${sqlNumber(selected.length-index)},source='manual',user_modified_at=${sqlNumber(now)} WHERE account_id=${sqlNumber(accountId)} AND category_id=${sqlNumber(categoryId)};`);
      else exec(`INSERT INTO account_categories(account_id,category_id,enabled,is_primary,weight,priority,source,user_modified_at)
        VALUES(${sqlNumber(accountId)},${sqlNumber(categoryId)},1,${sqlBool(index===0)},1,${sqlNumber(selected.length-index)},'manual',${sqlNumber(now)});`);
    }
    exec("COMMIT;");
  } catch (error) { exec("ROLLBACK;"); throw error; }
}

export function deleteAccount(id: number): void {
  requireOwnedAccount(id);
  exec(`DELETE FROM account_category_inferences WHERE account_id=${sqlNumber(id)};
    DELETE FROM account_category_inference_jobs WHERE account_id=${sqlNumber(id)};
    DELETE FROM account_categories WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM automation_jobs WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM drafts WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_metric_snapshots WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_subscription_events WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_subscription_state WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM accounts WHERE id=${sqlNumber(id)};`);
}

/** Deletes every row owned by a user and all FK descendants in one transaction. */
export function deleteOwnerData(ownerUserId: string): void {
  if (!ownerUserId.trim()) throw new Error("account owner is required");
  if (!ensureDatabase()) throw new Error(initializationError || "database unavailable");
  type ForeignKey = { id: number; seq: number; table: string; from: string; to: string };
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const tables = rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").map((row) => row.name);
  const columns = new Map<string, Set<string>>();
  const primary = new Map<string, string[]>();
  const foreignKeys = new Map<string, ForeignKey[]>();
  for (const table of tables) {
    const info = rows<{ name: string; pk: number }>(`PRAGMA table_info(${quote(table)});`);
    columns.set(table, new Set(info.map((item) => item.name)));
    primary.set(table, info.filter((item) => item.pk).sort((a, b) => a.pk - b.pk).map((item) => item.name));
    foreignKeys.set(table, rows<ForeignKey>(`PRAGMA foreign_key_list(${quote(table)});`));
  }
  exec("BEGIN IMMEDIATE;");
  try {
    const selected = new Map<string, Set<number>>();
    for (const table of tables) {
      if (!columns.get(table)?.has("owner_user_id")) continue;
      try {
        selected.set(table, new Set(rows<{ __rowid: number }>(`SELECT rowid AS __rowid FROM ${quote(table)} WHERE owner_user_id=${sqlString(ownerUserId)};`).map((row) => row.__rowid)));
      } catch { /* WITHOUT ROWID tables are expanded through their parent rows below. */ }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const child of tables) {
        const groups = new Map<number, ForeignKey[]>();
        for (const key of foreignKeys.get(child) || []) groups.set(key.id, [...(groups.get(key.id) || []), key]);
        for (const parts of groups.values()) {
          const parent = parts[0].table;
          const parentRows = selected.get(parent);
          if (!parentRows?.size) continue;
          const parentKeys = primary.get(parent) || [];
          const parentValues = new Map<string, Set<string>>();
          for (const part of parts) {
            const target = part.to || parentKeys[part.seq];
            if (!target) continue;
            const values = rows<{ value: unknown }>(`SELECT ${quote(target)} AS value FROM ${quote(parent)} WHERE rowid IN (${[...parentRows].map(sqlNumber).join(",")});`)
              .map((row) => row.value).filter((value) => value !== null && value !== undefined).map((value) => typeof value === "number" ? String(value) : String(value));
            parentValues.set(part.from, new Set(values));
          }
          if (!parentValues.size) continue;
          const predicates = [...parentValues].filter(([column, values]) => columns.get(child)?.has(column) && values.size)
            .map(([column, values]) => `${quote(column)} IN (${[...values].map((value) => sqlString(value)).join(",")})`);
          if (predicates.length !== parts.length) continue;
          try {
            const ids = rows<{ __rowid: number }>(`SELECT rowid AS __rowid FROM ${quote(child)} WHERE ${predicates.join(" AND ")};`).map((row) => row.__rowid);
            const target = selected.get(child) || new Set<number>();
            for (const id of ids) if (!target.has(id)) { target.add(id); changed = true; }
            selected.set(child, target);
          } catch { /* WITHOUT ROWID descendants are removed by SQLite FK cascades. */ }
        }
      }
    }

    const order: string[] = [];
    const visited = new Set<string>();
    const visit = (table: string) => {
      if (visited.has(table)) return;
      visited.add(table);
      for (const child of tables) if ((foreignKeys.get(child) || []).some((key) => key.table === table)) visit(child);
      order.push(table);
    };
    for (const table of tables) visit(table);
    for (const table of order) {
      const ids = [...(selected.get(table) || [])];
      for (let offset = 0; offset < ids.length; offset += 400) {
        exec(`DELETE FROM ${quote(table)} WHERE rowid IN (${ids.slice(offset, offset + 400).map(sqlNumber).join(",")});`);
      }
    }
    const scopedPrefix = `owner:${encodeURIComponent(ownerUserId)}:`;
    for (const table of ["secrets", "app_settings"] as const) {
      if (hasTable(table)) exec(`DELETE FROM ${quote(table)} WHERE substr(name,1,${sqlNumber(scopedPrefix.length)})=${sqlString(scopedPrefix)};`);
    }
    exec("COMMIT;");
  } catch (error) {
    exec("ROLLBACK;");
    throw error;
  }
}

/** Disabled users are denied from worker execution too; a missing auth table fails closed. */
export function isOwnerEnabled(ownerUserId: string): boolean {
  if (!ownerUserId.trim() || !ensureDatabase() || !hasTable("auth_user_status")) return false;
  const status = rows<{ status: string }>(`SELECT status FROM auth_user_status WHERE owner_user_id=${sqlString(ownerUserId)} LIMIT 1;`)[0]?.status;
  return status !== "disabled";
}

function competitorsFromRows(items: Array<{
  id: number; handle: string; name: string; category: string; enabled: number; initialized_at: number;
  last_success_at: number; last_error: string; created_at: number; updated_at: number;
}>): Competitor[] {
  return items.map((item) => ({
    id: item.id,
    handle: item.handle,
    name: item.name,
    category: item.category,
    enabled: item.enabled === 1,
    initializedAt: item.initialized_at,
    lastSuccessAt: item.last_success_at,
    lastError: item.last_error,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export function getCompetitors(): Competitor[] {
  return competitorsFromRows(rows<{ id: number; handle: string; name: string; category: string; enabled: number; initialized_at: number; last_success_at: number; last_error: string; created_at: number; updated_at: number }>(`SELECT id, handle, name, category, enabled, initialized_at, last_success_at, last_error, created_at, updated_at
    FROM competitors ORDER BY enabled DESC, handle;`));
}

export function saveCompetitor(input: { handle: string; name?: string; category?: string; enabled?: boolean; now: number }): Competitor {
  const handle = input.handle.replace(/^@/, "").toLowerCase();
  exec(`INSERT INTO competitors (handle, name, category, enabled, created_at, updated_at)
    VALUES (${sqlString(handle)}, ${sqlString((input.name || handle).trim())}, ${sqlString((input.category || "").trim())},
      ${sqlBool(input.enabled !== false)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)})
    ON CONFLICT(handle) DO UPDATE SET name=excluded.name, category=excluded.category, enabled=excluded.enabled, updated_at=excluded.updated_at;`);
  const result = getCompetitors().find((competitor) => competitor.handle === handle);
  if (!result) throw new Error("competitor could not be saved");
  return result;
}

export function deleteCompetitor(id: number): void {
  const ids = rows<{ external_id: string }>(`SELECT external_id FROM competitor_posts WHERE competitor_id=${sqlNumber(id)};`).map((item) => item.external_id);
  for (const externalId of ids) exec(`DELETE FROM competitor_post_snapshots WHERE external_id=${sqlString(externalId)};`);
  exec(`DELETE FROM competitor_posts WHERE competitor_id=${sqlNumber(id)};`);
  exec(`DELETE FROM competitor_profile_snapshots WHERE competitor_id=${sqlNumber(id)};`);
  exec(`DELETE FROM competitors WHERE id=${sqlNumber(id)};`);
}

export function recordAccountMetric(input: { accountId: number; followers: number; following: number; statuses: number; likes: number; mediaCount: number; blueCheckStatus?: BlueCheckStatus; now: number }): void {
  requireOwnedAccount(input.accountId);
  const latest = rows<{ captured_at: number }>(`SELECT captured_at FROM account_metric_snapshots WHERE account_id=${sqlNumber(input.accountId)} ORDER BY captured_at DESC LIMIT 1;`)[0];
  if (latest && input.now - latest.captured_at < 3600) return;
  exec(`INSERT INTO account_metric_snapshots (account_id, followers, following, statuses, likes, media_count, blue_check_status, verification_status, captured_at)
    VALUES (${sqlNumber(input.accountId)}, ${sqlNumber(input.followers)}, ${sqlNumber(input.following)}, ${sqlNumber(input.statuses)},
      ${sqlNumber(input.likes)}, ${sqlNumber(input.mediaCount)}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlNumber(input.now)});`);
}

export function recordCompetitorProfile(input: { competitorId: number; followers: number; following: number; statuses: number; likes: number; mediaCount: number; blueCheckStatus?: BlueCheckStatus; now: number }): void {
  const latest = rows<{ captured_at: number }>(`SELECT captured_at FROM competitor_profile_snapshots WHERE competitor_id=${sqlNumber(input.competitorId)} ORDER BY captured_at DESC LIMIT 1;`)[0];
  if (!latest || input.now - latest.captured_at >= 3600) {
    exec(`INSERT INTO competitor_profile_snapshots (competitor_id, followers, following, statuses, likes, media_count, blue_check_status, verification_status, captured_at)
      VALUES (${sqlNumber(input.competitorId)}, ${sqlNumber(input.followers)}, ${sqlNumber(input.following)}, ${sqlNumber(input.statuses)},
        ${sqlNumber(input.likes)}, ${sqlNumber(input.mediaCount)}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlNumber(input.now)});`);
  }
  exec(`UPDATE competitors SET last_success_at=${sqlNumber(input.now)}, last_error='', updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.competitorId)};`);
}

export function recordCompetitorError(id: number, error: string, now: number): void {
  exec(`UPDATE competitors SET last_error=${sqlString(error.slice(0, 500))}, updated_at=${sqlNumber(now)} WHERE id=${sqlNumber(id)};`);
}

export function upsertCompetitorPost(input: {
  competitorId: number; externalId: string; statusUrl: string; text: string; createdTimestamp: number;
  mediaCount: number; mediaJson: string; rawJson: string; blueCheckStatus?: BlueCheckStatus; metrics: PublicMetrics; now: number; history: boolean;
}): boolean {
  const existed = rows<{ external_id: string }>(`SELECT external_id FROM competitor_posts WHERE external_id=${sqlString(input.externalId)} LIMIT 1;`).length > 0;
  const metrics = metricValues(input.metrics);
  exec(`INSERT INTO competitor_posts (competitor_id, external_id, status_url, text, created_timestamp, likes, replies, reposts, quotes, views, poll_votes, media_count, media_json, raw_json, author_blue_check_status, author_verification_status, first_seen_at)
    VALUES (${sqlNumber(input.competitorId)}, ${sqlString(input.externalId)}, ${sqlString(input.statusUrl)}, ${sqlString(input.text)}, ${sqlNumber(input.createdTimestamp)},
      ${sqlNumber(metrics.likes)}, ${sqlNumber(metrics.replies)}, ${sqlNumber(metrics.reposts)}, ${sqlNumber(metrics.quotes)}, ${sqlNumber(metrics.views)}, ${sqlNumber(metrics.pollVotes)},
      ${sqlNumber(input.mediaCount)}, ${sqlString(input.mediaJson)}, ${sqlString(input.rawJson)}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlString(input.blueCheckStatus || "unknown")}, ${sqlNumber(input.now)})
    ON CONFLICT(external_id) DO UPDATE SET likes=excluded.likes, replies=excluded.replies, reposts=excluded.reposts, quotes=excluded.quotes, views=excluded.views, poll_votes=excluded.poll_votes, media_count=excluded.media_count, media_json=excluded.media_json, raw_json=excluded.raw_json, author_blue_check_status=excluded.author_blue_check_status, author_verification_status=excluded.author_verification_status;`);
  if (!existed && input.history) recordCompetitorPostSnapshot({ externalId: input.externalId, metrics, milestone: "history", now: input.now });
  return !existed;
}

export function recordCompetitorPostSnapshot(input: { externalId: string; metrics: PublicMetrics; milestone: string; now: number }): void {
  const metrics = metricValues(input.metrics);
  exec(`INSERT INTO competitor_post_snapshots (external_id, likes, replies, reposts, quotes, views, poll_votes, milestone, captured_at)
    VALUES (${sqlString(input.externalId)}, ${sqlNumber(metrics.likes)}, ${sqlNumber(metrics.replies)}, ${sqlNumber(metrics.reposts)}, ${sqlNumber(metrics.quotes)},
      ${sqlNumber(metrics.views)}, ${sqlNumber(metrics.pollVotes)}, ${sqlString(input.milestone)}, ${sqlNumber(input.now)});`);
}

export function markCompetitorInitialized(id: number, now: number): void {
  exec(`UPDATE competitors SET initialized_at=${sqlNumber(now)}, last_success_at=${sqlNumber(now)}, last_error='', updated_at=${sqlNumber(now)} WHERE id=${sqlNumber(id)};`);
}

export function competitorFeedbackDue(now: number): Array<{ externalId: string; milestones: string[] }> {
  const posts = rows<{ external_id: string; created_timestamp: number }>(`SELECT posts.external_id, posts.created_timestamp FROM competitor_posts AS posts
    INNER JOIN competitors ON competitors.id=posts.competitor_id
    WHERE posts.created_timestamp >= ${sqlNumber(now - 14 * 86400)} AND posts.first_seen_at > competitors.initialized_at
    ORDER BY posts.created_timestamp ASC LIMIT 80;`);
  return posts.map((post) => {
    const completed = new Set(rows<{ milestone: string }>(`SELECT DISTINCT milestone FROM competitor_post_snapshots WHERE external_id=${sqlString(post.external_id)};`).map((item) => item.milestone));
    return { externalId: post.external_id, milestones: feedbackMilestones(post.created_timestamp, now).filter((milestone) => !completed.has(milestone)) };
  }).filter((post) => post.milestones.length > 0).slice(0, 30);
}

function marketDecisionFor(post: RecentPost, now: number): MarketDecision {
  if (post.sensitive) return "sensitive";
  if (post.publishStatus === "confirmed" || post.publishStatus === "pending_reconciliation") return "processed";
  if (post.createdTimestamp <= 0 || post.createdTimestamp > now + 300 || now - post.createdTimestamp > OPPORTUNITY_MAX_AGE_SECONDS) return "expired";
  if (scoreEvidenceFor(post.scoreReason, post.score).kind !== "deterministic") return "not_eligible_evidence";
  return opportunityScoreForPost(post, now) >= opportunityPoolThreshold() ? "opportunity" : "below_threshold";
}

function toMarketItem(post: RecentPost, now = Math.floor(Date.now() / 1000)): MarketItem {
    const engagement = observedEngagement(post);
    const marketStatus = post.publishStatus === "confirmed"
      ? "published"
      : post.publishStatus === "pending_reconciliation"
        ? "queued"
        : post.draftStatus !== "not_started"
          ? "drafted"
          : "new";
    const scoreEvidence = scoreEvidenceFor(post.scoreReason, post.score);
    const momentum = Math.round(post.score);
    const freshness = opportunityFreshness(post.createdTimestamp, now);
    const { rawJson: _rawJson, ...marketPost } = post;
    void _rawJson;
    return {
      ...marketPost,
      score: opportunityScoreForPost(post, now),
      momentum,
      freshness,
      velocity: Math.round(engagement.velocity),
      relevance: Math.round(post.score),
      risk: post.sensitive ? 100 : scoreEvidence.risk,
      engagementRate: engagement.rate,
      engagements: Math.round(engagement.engagements),
      hit: isNumericalHit(scoreEvidence.momentum, post.createdTimestamp, scoreEvidence.risk),
      marketStatus,
      decision: marketDecisionFor(post, now),
      scoreEvidence,
      jevRelevance: postRelevance(post),
      jevRelevanceFactor: relevanceFactor(postRelevance(post)),
      jevRelevanceSource: String(post.relevanceSource || ""),
      jevRelevanceAt: Number(post.relevanceAt || 0),
      jevRelevanceApplied: relevanceApplies() && postRelevance(post) !== null,
    };
}

export function getMarketItems(limit = 50): MarketItem[] {
  return getRecentPosts(limit).filter((post) => !post.sensitive).map(toMarketItem);
}

export function getOpportunityItems(limit?: number): MarketItem[] {
  const now = Math.floor(Date.now() / 1000);
  return selectMarketPosts(opportunityWhere(now), "created_timestamp DESC")
    .map((post) => toMarketItem(post, now))
    .filter((post) => post.decision === "opportunity")
    .sort((left, right) => right.score - left.score || right.observedAt - left.observedAt)
    .slice(0, limit);
}

export function getMarketInbox(input: { view?: MarketView; limit?: number; offset?: number; now?: number } = {}): MarketInbox {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const view = MARKET_VIEWS.includes(input.view as MarketView) ? input.view as MarketView : "opportunities";
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit || 50)));
  const offset = Math.max(0, Math.floor(input.offset || 0));
  const observed = selectMarketPosts(`observed_at >= ${sqlNumber(now - OPPORTUNITY_MAX_AGE_SECONDS)}`, "observed_at DESC, id ASC")
    .map((post) => toMarketItem(post, now));
  const counts = {
    opportunities: observed.filter((item) => item.decision === "opportunity").length,
    observed: observed.filter((item) => item.decision !== "sensitive").length,
    rejected: observed.filter((item) => item.decision === "below_threshold" || item.decision === "expired" || item.decision === "not_eligible_evidence").length,
    sensitive: observed.filter((item) => item.decision === "sensitive").length,
  };
  const items = observed.filter((item) => {
    if (view === "opportunities") return item.decision === "opportunity";
    if (view === "rejected") return item.decision === "below_threshold" || item.decision === "expired" || item.decision === "not_eligible_evidence";
    return view === "sensitive" ? item.decision === "sensitive" : item.decision !== "sensitive";
  });
  return { items: items.slice(offset, offset + limit), total: items.length, counts };
}

export function opportunityCount(now = Math.floor(Date.now() / 1000)): number {
  const threshold = opportunityPoolThreshold();
  return selectPosts(opportunityWhere(now), "created_timestamp DESC").filter((post) => scoreEvidenceFor(post.scoreReason, post.score).kind === "deterministic" && opportunityScoreForPost(post, now) >= threshold).length;
}

export function scoreEvidenceFor(value: string, score: number): ScoreEvidence {
  const separator = value.indexOf(":");
  const kindValue = separator >= 0 ? value.slice(0, separator) : value;
  const json = separator >= 0 ? value.slice(separator + 1) : "";
  if ((kindValue === "deterministic" || kindValue === "hybrid" || kindValue === "heuristic") && json) {
    try {
      const parsed = JSON.parse(json) as Partial<ScoreEvidence>;
      return {
        kind: kindValue as ScoreEvidence["kind"],
        momentum: Number(parsed.momentum || 0),
        ai: Number(parsed.ai || 0),
        risk: Number(parsed.risk || 0),
        confidence: Number(parsed.confidence || 0),
        model: String(parsed.model || ""),
        reason: String(parsed.reason || ""),
        categories: Array.isArray(parsed.categories) ? parsed.categories.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 3) : [],
        breaking: parsed.breaking === true,
        breakingReason: String(parsed.breakingReason || ""),
      };
    } catch {
      // Legacy score reasons remain visible as heuristic evidence.
    }
  }
  return {
    kind: "deterministic",
    momentum: Math.round(score),
    ai: 0,
    risk: score < 70 ? 45 : 15,
    confidence: 0,
    model: "",
    reason: value,
    categories: [],
    breaking: false,
    breakingReason: "",
  };
}

/**
 * True only in jev_mode "on". Read through the setting rather than importing jev.ts:
 * jev.ts already imports db.ts, and a module cycle would be resolved at import time
 * for every db consumer.
 */
function relevanceApplies(): boolean {
  return getSetting("jev_mode", "off") === "on";
}

/** The stored 0-100 relevance for a post, or null when there is no relevance evidence. */
export function postRelevance(post: Pick<ObservedPost, "relevanceScore">): number | null {
  const value = post.relevanceScore;
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

/** Per-account relevance persisted by the opportunity batch, as { accountId: 0-100 }. */
export function postAccountRelevance(post: Pick<ObservedPost, "relevanceJson">): Record<number, number> {
  const parsed = parseObject(post.relevanceJson || "{}");
  const perAccount = object(parsed.perAccount);
  const map: Record<number, number> = {};
  for (const [key, value] of Object.entries(perAccount)) {
    const accountId = Number(key);
    const score = Number(value);
    if (Number.isFinite(accountId) && accountId > 0 && Number.isFinite(score)) map[accountId] = Math.min(100, Math.max(0, score));
  }
  return map;
}

/** Writes the layered relevance columns. Never touches score or score_reason. */
export function updatePostRelevance(input: {
  externalId: string;
  relevance: number | null;
  source: string;
  details?: Record<string, unknown>;
  now: number;
}): void {
  exec(`UPDATE observed_posts SET
    relevance_score=${sqlReal(input.relevance)},
    relevance_source=${sqlString(input.source)},
    relevance_json=${sqlString(JSON.stringify(input.details || {}))},
    relevance_at=${sqlNumber(input.now)}
    WHERE external_id=${sqlString(input.externalId)};`);
}

export const OPPORTUNITY_POOL_THRESHOLD_SETTING = "opportunity_pool_threshold";
export const DEFAULT_OPPORTUNITY_POOL_THRESHOLD = 70;

/**
 * The score a post must reach to enter the candidate pool.
 *
 * The pool used to hardcode 70 while every account could ask for less through its
 * account_categories.publish_threshold, so a niche account with threshold 55 never
 * saw the posts it had asked for. The pool threshold is therefore
 * `min(opportunity_pool_threshold, lowest enabled account publish_threshold)`:
 * the pool is never stricter than the strictest gate downstream, and
 * publishCandidate() still applies each account's own threshold afterwards.
 */
export function opportunityPoolThreshold(): number {
  const raw = Number(getSetting(OPPORTUNITY_POOL_THRESHOLD_SETTING, String(DEFAULT_OPPORTUNITY_POOL_THRESHOLD)));
  const configured = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : DEFAULT_OPPORTUNITY_POOL_THRESHOLD;
  const enabledAccounts = new Set(getAccounts().filter((account) => account.enabled).map((account) => account.id));
  const thresholds = getAccountCategoryConfigs()
    .filter((item) => item.enabled && enabledAccounts.has(item.accountId))
    .map((item) => item.publishThreshold)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return thresholds.length ? Math.min(configured, ...thresholds) : configured;
}

export function opportunityScoreForPost(post: Pick<RecentPost, "score" | "scoreReason" | "sensitive" | "createdTimestamp"> & Pick<ObservedPost, "relevanceScore">, now = Math.floor(Date.now() / 1000)): number {
  const evidence = scoreEvidenceFor(post.scoreReason, post.score);
  const risk = post.sensitive ? 100 : evidence.risk;
  const relevance = relevanceApplies() ? postRelevance(post) : null;
  // Relevance null (mode off, or no evidence) reproduces the legacy score exactly.
  return opportunityScoreRelevanceAware(post.score, post.createdTimestamp, risk, relevance, now);
}

export function getDrafts(limit = 100): DraftRecord[] {
  return rows<{
    id: number;
    batch_id: string;
    origin: string;
    prompt: string;
    provider: string;
    model: string;
    variant_mode: string;
    external_id: string;
    account_id: number | null;
    handle: string | null;
    format: string;
    text: string;
    status: string;
    gate_reason: string;
    source_handle: string | null;
    source_url: string | null;
    source_score: number | null;
    score: number | null;
    created_at: number;
    updated_at: number;
  }>(`SELECT drafts.id, drafts.batch_id, drafts.origin, drafts.prompt, drafts.provider,
      drafts.model, drafts.variant_mode, drafts.external_id, drafts.account_id, accounts.handle,
      drafts.format, drafts.text, drafts.status, drafts.gate_reason,
      COALESCE(NULLIF(drafts.source_handle, ''), observed_posts.source_handle) as source_handle,
      COALESCE(NULLIF(drafts.source_url, ''), observed_posts.status_url) as source_url,
      COALESCE(NULLIF(drafts.source_score, 0), observed_posts.score) as source_score,
      drafts.created_at, drafts.updated_at
      FROM drafts
      LEFT JOIN accounts ON accounts.id=drafts.account_id
      LEFT JOIN observed_posts ON observed_posts.external_id=drafts.external_id
      ${ownerSql("drafts.owner_user_id") ? `WHERE ${ownerSql("drafts.owner_user_id")}` : ""}
  ORDER BY drafts.updated_at DESC, drafts.id DESC LIMIT ${sqlNumber(limit)};`).map((draft) => ({
    id: draft.id,
    batchId: draft.batch_id || "",
    origin: draft.origin || "manual",
    prompt: draft.prompt || "",
    provider: draft.provider || "",
    model: draft.model || "",
    variantMode: draft.variant_mode || "same_text",
    externalId: draft.external_id,
    accountId: draft.account_id,
    accountHandle: draft.handle || "atanmamış",
    format: draft.format,
    text: draft.text,
    status: draft.status,
    gateReason: draft.gate_reason,
    sourceHandle: draft.source_handle || "",
    sourceUrl: draft.source_url || "",
    score: draft.source_score || 0,
    evaluation: getDraftEvaluation(draft.id),
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  }));
}

export function getDraft(id: number): DraftRecord | null {
  return getDrafts(200).find((draft) => draft.id === id) || null;
}

type DraftBaselineSample = {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  views: number | null;
};

function summariseDraftBaseline(samples: DraftBaselineSample[], scope: DraftPerformanceBaseline["scope"]): DraftPerformanceBaseline {
  const valid = samples.filter((sample) => sample.views !== null || sample.likes !== null || sample.replies !== null || sample.reposts !== null || sample.quotes !== null);
  const metric = (key: keyof DraftBaselineSample) => median(valid.map((sample) => sample[key]).filter((value): value is number => value !== null && Number.isFinite(value)));
  const rates = valid.flatMap((sample) => {
    const views = sample.views;
    if (views === null || views <= 0) return [];
    const actions = (sample.likes || 0) + (sample.replies || 0) + (sample.reposts || 0) + (sample.quotes || 0);
    return [actions / views];
  });
  return {
    scope,
    samples: valid.length,
    medianViews: metric("views"),
    medianLikes: metric("likes"),
    medianReplies: metric("replies"),
    medianReposts: metric("reposts"),
    medianQuotes: metric("quotes"),
    medianEngagementRate: median(rates),
  };
}

function publicationBaselineSamples(accountId: number, format: string, categorySlug = ""): DraftBaselineSample[] {
  const categoryClause = categorySlug ? `AND (
      EXISTS (
        SELECT 1 FROM draft_evaluations AS historical_evaluation
        WHERE historical_evaluation.draft_id=draft.id AND historical_evaluation.category_slug=${sqlString(categorySlug)}
      )
      OR EXISTS (
        SELECT 1 FROM observed_posts AS observed
        INNER JOIN source_categories AS source_category ON source_category.source_handle=observed.source_handle AND source_category.enabled=1
        INNER JOIN categories AS category ON category.id=source_category.category_id
        WHERE observed.external_id=draft.external_id AND category.slug=${sqlString(categorySlug)}
      )
    )` : "";
  return rows<DraftBaselineSample>(`
    SELECT snapshot.likes, snapshot.replies, snapshot.reposts, snapshot.quotes, snapshot.views
    FROM publications AS publication
    INNER JOIN drafts AS draft ON draft.id=publication.draft_id
    INNER JOIN (
      SELECT publication_id, MAX(captured_at) AS captured_at
      FROM publication_metric_snapshots
      WHERE metric_quality='ok'
      GROUP BY publication_id
    ) AS latest ON latest.publication_id=publication.id
    INNER JOIN publication_metric_snapshots AS snapshot
      ON snapshot.publication_id=latest.publication_id AND snapshot.captured_at=latest.captured_at
    WHERE publication.account_id=${sqlNumber(accountId)}
      AND publication.status='confirmed'
      AND draft.format=${sqlString(format)}
      ${categoryClause}
    ORDER BY snapshot.captured_at DESC
    LIMIT 80;
  `);
}

export function draftPerformanceBaseline(input: { accountId: number; format: string; categorySlug?: string }): DraftPerformanceBaseline {
  requireOwnedAccount(input.accountId);
  const categorySlug = String(input.categorySlug || "").trim().toLocaleLowerCase("tr-TR");
  if (categorySlug) {
    const exact = publicationBaselineSamples(input.accountId, input.format, categorySlug);
    if (exact.length >= 5) return summariseDraftBaseline(exact, "account_category_format");
  }
  const formatSamples = publicationBaselineSamples(input.accountId, input.format);
  if (formatSamples.length >= 5) return summariseDraftBaseline(formatSamples, "account_format");
  const accountSamples = rows<DraftBaselineSample>(`
    SELECT feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views
    FROM publish_attempts AS attempt
    INNER JOIN feedback_snapshots AS feedback ON feedback.post_external_id=attempt.post_external_id
    INNER JOIN (
      SELECT post_external_id, MAX(captured_at) AS captured_at
      FROM feedback_snapshots
      WHERE milestone IN ('60dk', '24s', 'legacy')
      GROUP BY post_external_id
    ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    WHERE attempt.account_id=${sqlNumber(input.accountId)} AND attempt.status='confirmed'
    ORDER BY feedback.captured_at DESC
    LIMIT 80;
  `);
  return accountSamples.length
    ? summariseDraftBaseline(accountSamples, "account")
    : summariseDraftBaseline([], "none");
}

function parseStringList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function getDraftEvaluation(draftId: number): DraftEvaluation | null {
  if (!rows<{ id: number }>(`SELECT id FROM drafts WHERE id=${sqlNumber(draftId)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""} LIMIT 1;`).length) return null;
  const row = rows<{
    id: number; draft_id: number; account_id: number | null; category_slug: string; mode: string; score: number; confidence: number;
    predicted_residual: number | null; baseline_scope: DraftPerformanceBaseline["scope"]; baseline_samples: number;
    baseline_views: number | null; baseline_likes: number | null; baseline_replies: number | null; baseline_reposts: number | null;
    baseline_quotes: number | null; baseline_engagement_rate: number | null; predicted_views: number | null; predicted_replies: number | null;
    predicted_reposts: number | null; predicted_quotes: number | null; features_json: string; semantic_json: string;
    helped_json: string; hurt_json: string; created_at: number; updated_at: number;
  }>(`SELECT * FROM draft_evaluations WHERE draft_id=${sqlNumber(draftId)} LIMIT 1;`)[0];
  if (!row) return null;
  return {
    id: row.id,
    draftId: row.draft_id,
    accountId: row.account_id,
    categorySlug: row.category_slug,
    mode: row.mode === "shadow_calibrated" ? "shadow_calibrated" : "shadow_cold_start",
    score: Math.round(row.score),
    confidence: Math.round(row.confidence),
    predictedResidual: row.predicted_residual,
    baseline: {
      scope: row.baseline_scope || "none",
      samples: row.baseline_samples,
      medianViews: row.baseline_views,
      medianLikes: row.baseline_likes,
      medianReplies: row.baseline_replies,
      medianReposts: row.baseline_reposts,
      medianQuotes: row.baseline_quotes,
      medianEngagementRate: row.baseline_engagement_rate,
    },
    predictedViews: row.predicted_views,
    predictedReplies: row.predicted_replies,
    predictedReposts: row.predicted_reposts,
    predictedQuotes: row.predicted_quotes,
    features: parseObject(row.features_json),
    semantic: parseObject(row.semantic_json),
    helped: parseStringList(row.helped_json),
    hurt: parseStringList(row.hurt_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function recordDraftEvaluation(input: {
  draftId: number;
  accountId: number | null;
  categorySlug: string;
  mode: DraftEvaluation["mode"];
  score: number;
  confidence: number;
  predictedResidual: number | null;
  baseline: DraftPerformanceBaseline;
  predictedViews: number | null;
  predictedReplies: number | null;
  predictedReposts: number | null;
  predictedQuotes: number | null;
  features: Record<string, unknown>;
  semantic: Record<string, unknown>;
  helped: string[];
  hurt: string[];
  now: number;
}): DraftEvaluation {
  if (!getDraft(input.draftId)) throw new Error("draft not found");
  if (input.accountId) requireOwnedAccount(input.accountId);
  exec(`INSERT INTO draft_evaluations (
      draft_id, account_id, category_slug, mode, score, confidence, predicted_residual,
      baseline_scope, baseline_samples, baseline_views, baseline_likes, baseline_replies, baseline_reposts, baseline_quotes,
      baseline_engagement_rate, predicted_views, predicted_replies, predicted_reposts, predicted_quotes,
      features_json, semantic_json, helped_json, hurt_json, created_at, updated_at
    ) VALUES (
      ${sqlNumber(input.draftId)}, ${input.accountId ? sqlNumber(input.accountId) : "NULL"}, ${sqlString(input.categorySlug)},
      ${sqlString(input.mode)}, ${sqlReal(input.score)}, ${sqlReal(input.confidence)}, ${sqlReal(input.predictedResidual)},
      ${sqlString(input.baseline.scope)}, ${sqlNumber(input.baseline.samples)}, ${sqlReal(input.baseline.medianViews)},
      ${sqlReal(input.baseline.medianLikes)}, ${sqlReal(input.baseline.medianReplies)}, ${sqlReal(input.baseline.medianReposts)},
      ${sqlReal(input.baseline.medianQuotes)}, ${sqlReal(input.baseline.medianEngagementRate)}, ${sqlReal(input.predictedViews)},
      ${sqlReal(input.predictedReplies)}, ${sqlReal(input.predictedReposts)}, ${sqlReal(input.predictedQuotes)},
      ${sqlString(JSON.stringify(input.features))}, ${sqlString(JSON.stringify(input.semantic))},
      ${sqlString(JSON.stringify(input.helped.slice(0, 8)))}, ${sqlString(JSON.stringify(input.hurt.slice(0, 8)))},
      ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
    ) ON CONFLICT(draft_id) DO UPDATE SET
      account_id=excluded.account_id, category_slug=excluded.category_slug, mode=excluded.mode, score=excluded.score,
      confidence=excluded.confidence, predicted_residual=excluded.predicted_residual, baseline_scope=excluded.baseline_scope,
      baseline_samples=excluded.baseline_samples, baseline_views=excluded.baseline_views, baseline_likes=excluded.baseline_likes,
      baseline_replies=excluded.baseline_replies, baseline_reposts=excluded.baseline_reposts, baseline_quotes=excluded.baseline_quotes,
      baseline_engagement_rate=excluded.baseline_engagement_rate, predicted_views=excluded.predicted_views,
      predicted_replies=excluded.predicted_replies, predicted_reposts=excluded.predicted_reposts, predicted_quotes=excluded.predicted_quotes,
      features_json=excluded.features_json, semantic_json=excluded.semantic_json, helped_json=excluded.helped_json,
      hurt_json=excluded.hurt_json, updated_at=excluded.updated_at;`);
  const result = getDraftEvaluation(input.draftId);
  if (!result) throw new Error("draft evaluation kaydedilemedi");
  return result;
}

type PublicationIntentRow = {
  id: number; draft_id: number; account_id: number; handle: string | null; status: PublicationIntentStatus;
  idempotency_key: string; text: string; media_path: string; media_hash: string;
  receipt: string; remote_url: string; remote_post_id: string; reason: string; requested_at: number; approved_at: number | null;
  approval_expires_at: number | null; approval_snapshot_id: number | null;
  dispatched_at: number | null; confirmed_at: number | null; updated_at: number;
  lease_token: string | null; lease_until: number | null; heartbeat_at: number | null; attempts: number; max_attempts: number;
  next_attempt_at: number; error_class: string; dead_lettered_at: number | null; remote_write_started_at: number | null;
};

function publicationIntent(row: PublicationIntentRow): PublicationIntent {
  return {
    id: row.id, draftId: row.draft_id, accountId: row.account_id, accountHandle: row.handle || "",
    status: row.status, idempotencyKey: row.idempotency_key, text: row.text, mediaPath: row.media_path,
    mediaHash: row.media_hash, receipt: row.receipt, remoteUrl: row.remote_url, remotePostId: row.remote_post_id,
    reason: row.reason, requestedAt: row.requested_at, approvedAt: row.approved_at,
    approvalExpiresAt: row.approval_expires_at, approvalSnapshotId: row.approval_snapshot_id,
    dispatchedAt: row.dispatched_at, confirmedAt: row.confirmed_at, updatedAt: row.updated_at,
    leaseToken: row.lease_token, leaseUntil: row.lease_until, heartbeatAt: row.heartbeat_at,
    attempts: row.attempts, maxAttempts: row.max_attempts, nextAttemptAt: row.next_attempt_at,
    errorClass: row.error_class, deadLetteredAt: row.dead_lettered_at, remoteWriteStartedAt: row.remote_write_started_at,
  };
}

function recordPublicationIntentEvent(intentId: number, event: string, status: string, errorClass: string, now: number): void {
  exec(`INSERT INTO publication_intent_events (intent_id, event, status, error_class, created_at)
    VALUES (${sqlNumber(intentId)}, ${sqlString(event)}, ${sqlString(status)}, ${sqlString(errorClass)}, ${sqlNumber(now)});`);
}

function approvalExpiry(draft: DraftRecord, now: number): number {
  return now + (draft.externalId || draft.sourceUrl || draft.sourceHandle ? 15 * 60 : 24 * 60 * 60);
}

function recordApprovalSnapshot(input: {
  entityType: "publication_intent" | "automation_job"; entityId: number; draft: DraftRecord; accountId: number | null;
  action: string; text: string; mediaHash?: string; source: "human" | "automatic"; now: number; expiresAt: number;
}): number {
  const revision = Number(rows<{ revision: number }>(`SELECT COALESCE(MAX(draft_revision),0)+1 AS revision
    FROM publication_approval_snapshots WHERE draft_id=${sqlNumber(input.draft.id)};`)[0]?.revision || 1);
  const targetId = input.draft.sourceUrl.match(/\/status\/(\d{1,19})/)?.[1] ||
    (/^(reply|repost|quote)$/.test(input.action) ? input.draft.externalId : "");
  exec(`INSERT INTO publication_approval_snapshots(
      entity_type,entity_id,draft_id,draft_revision,text,account_id,action,format,target_id,external_id,source_handle,source_url,media_hash,approval_source,approved_at,expires_at
    ) VALUES (${sqlString(input.entityType)},${sqlNumber(input.entityId)},${sqlNumber(input.draft.id)},${sqlNumber(revision)},${sqlString(input.text)},${input.accountId === null ? "NULL" : sqlNumber(input.accountId)},
      ${sqlString(input.action)},${sqlString(input.draft.format)},${sqlString(targetId)},${sqlString(input.draft.externalId)},
      ${sqlString(input.draft.sourceHandle)},${sqlString(input.draft.sourceUrl)},${sqlString(input.mediaHash || "")},${sqlString(input.source)},
      ${sqlNumber(input.now)},${sqlNumber(input.expiresAt)});`);
  return Number(rows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0]?.id);
}

export function getApprovalSnapshotSource(entityType: "publication_intent" | "automation_job", entityId: number): "human" | "automatic" | null {
  const visible = entityType === "publication_intent" ? getPublicationIntent(entityId) : getJob(entityId);
  if (!visible?.approvalSnapshotId) return null;
  return rows<{ approval_source: "human" | "automatic" }>(`SELECT approval_source FROM publication_approval_snapshots
    WHERE id=${sqlNumber(visible.approvalSnapshotId)} AND entity_type=${sqlString(entityType)} AND entity_id=${sqlNumber(entityId)} LIMIT 1;`)[0]?.approval_source || null;
}

export function getPublicationIntentEvents(intentId: number): PublicationIntentEvent[] {
  if (!getPublicationIntent(intentId)) return [];
  return rows<PublicationIntentEvent>(`SELECT events.id, events.intent_id AS intentId, events.event, events.status,
      events.error_class AS errorClass, events.created_at AS createdAt
    FROM publication_intent_events AS events INNER JOIN publication_intents AS intent ON intent.id=events.intent_id
    INNER JOIN drafts ON drafts.id=intent.draft_id
    WHERE events.intent_id=${sqlNumber(intentId)} ${ownerSql("drafts.owner_user_id") ? `AND ${ownerSql("drafts.owner_user_id")}` : ""}
    ORDER BY events.id;`);
}

export function getPublicationIntents(input: { status?: PublicationIntentStatus; limit?: number } = {}): PublicationIntent[] {
  return rows<PublicationIntentRow>(`SELECT publication_intents.*, accounts.handle FROM publication_intents
    LEFT JOIN accounts ON accounts.id=publication_intents.account_id
    INNER JOIN drafts AS intent_draft ON intent_draft.id=publication_intents.draft_id
    WHERE ${input.status ? `publication_intents.status=${sqlString(input.status)}` : "1=1"}
    ${ownerSql("intent_draft.owner_user_id") ? `AND ${ownerSql("intent_draft.owner_user_id")}` : ""}
    ORDER BY publication_intents.requested_at ASC, publication_intents.id ASC
    LIMIT ${sqlNumber(Math.max(1, Math.min(500, input.limit || 100)))};`).map(publicationIntent);
}

export function getPendingPublicationIntents(limit = 100): PublicationIntent[] {
  return rows<PublicationIntentRow>(`SELECT publication_intents.*, accounts.handle FROM publication_intents
    LEFT JOIN accounts ON accounts.id=publication_intents.account_id
    INNER JOIN drafts AS intent_draft ON intent_draft.id=publication_intents.draft_id
    WHERE publication_intents.status='pending_approval' ${ownerSql("intent_draft.owner_user_id") ? `AND ${ownerSql("intent_draft.owner_user_id")}` : ""}
    ORDER BY publication_intents.requested_at ASC, publication_intents.id ASC
    LIMIT ${sqlNumber(Math.max(1, Math.min(500, limit)))};`).map(publicationIntent);
}

export function getPublicationIntent(id: number): PublicationIntent | null {
  const row = rows<PublicationIntentRow>(`SELECT publication_intents.*, accounts.handle FROM publication_intents
    LEFT JOIN accounts ON accounts.id=publication_intents.account_id
    INNER JOIN drafts AS intent_draft ON intent_draft.id=publication_intents.draft_id
    WHERE publication_intents.id=${sqlNumber(id)} ${ownerSql("intent_draft.owner_user_id") ? `AND ${ownerSql("intent_draft.owner_user_id")}` : ""} LIMIT 1;`)[0];
  return row ? publicationIntent(row) : null;
}

export function createPublicationIntent(input: { draftId: number; accountId: number; idempotencyKey: string; text: string; mediaPath?: string; mediaHash?: string; now: number }): PublicationIntent {
  const draft = getDraft(input.draftId);
  const account = getAccounts().find((item) => item.id === input.accountId);
  if (!draft || !account) throw new Error("publication intent için draft ve hesap gerekli");
  if (draft.accountId && draft.accountId !== input.accountId) throw new Error("publication intent account does not match draft");
  const existing = rows<{ id: number; status: PublicationIntentStatus }>(`SELECT publication_intents.id, publication_intents.status FROM publication_intents
    INNER JOIN drafts ON drafts.id=publication_intents.draft_id
    WHERE idempotency_key=${sqlString(input.idempotencyKey)} ${ownerSql("drafts.owner_user_id") ? `AND ${ownerSql("drafts.owner_user_id")}` : ""} LIMIT 1;`)[0];
  if (existing && !["cancelled", "expired"].includes(existing.status)) return getPublicationIntent(existing.id)!;
  const idempotencyKey = existing ? `${input.idempotencyKey}:retry:${randomUUID()}` : input.idempotencyKey;
  exec(`INSERT INTO publication_intents (
      draft_id, account_id, status, idempotency_key, text, media_path, media_hash, requested_at, updated_at
    ) VALUES (
      ${sqlNumber(input.draftId)}, ${sqlNumber(input.accountId)}, 'pending_approval', ${sqlString(idempotencyKey)},
      ${sqlString(input.text.slice(0, 280))}, ${sqlString(input.mediaPath || "")}, ${sqlString(input.mediaHash || "")},
      ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
    );`);
  const intent = rows<{ id: number }>(`SELECT id FROM publication_intents WHERE idempotency_key=${sqlString(idempotencyKey)} LIMIT 1;`)[0];
  if (!intent) throw new Error("publication intent oluşturulamadı");
  recordPublicationIntentEvent(intent.id, "created", "pending_approval", "", input.now);
  return getPublicationIntent(intent.id)!;
}

export function updatePublicationIntent(input: {
  id: number; status: PublicationIntentStatus; reason?: string; receipt?: string; remoteUrl?: string;
  approvedAt?: number | null; approvalExpiresAt?: number | null; approvalSnapshotId?: number | null;
  approvalSource?: "human" | "automatic"; dispatchedAt?: number | null; confirmedAt?: number | null; leaseToken?: string; now: number;
}): PublicationIntent | null {
  const current = getPublicationIntent(input.id);
  if (!current) return null;
  if (input.status === "approved" && current.status === "pending_approval") return createPublicationApproval({ id: input.id, now: input.now, source: input.approvalSource });
  if (current.leaseToken && (current.leaseToken !== input.leaseToken || current.leaseUntil === null || current.leaseUntil <= input.now)) return null;
  exec(`UPDATE publication_intents SET status=${sqlString(input.status)}, reason=${sqlString(input.reason ?? current.reason)},
    receipt=${sqlString(input.receipt ?? current.receipt)},
    remote_url=${sqlString(input.remoteUrl ?? current.remoteUrl)},
    approved_at=${input.approvedAt === undefined ? "approved_at" : input.approvedAt === null ? "NULL" : sqlNumber(input.approvedAt)},
    approval_expires_at=${input.approvalExpiresAt === undefined ? "approval_expires_at" : input.approvalExpiresAt === null ? "NULL" : sqlNumber(input.approvalExpiresAt)},
    approval_snapshot_id=${input.approvalSnapshotId === undefined ? "approval_snapshot_id" : input.approvalSnapshotId === null ? "NULL" : sqlNumber(input.approvalSnapshotId)},
    dispatched_at=${input.dispatchedAt === undefined ? "dispatched_at" : input.dispatchedAt === null ? "NULL" : sqlNumber(input.dispatchedAt)},
    confirmed_at=${input.confirmedAt === undefined ? "confirmed_at" : input.confirmedAt === null ? "NULL" : sqlNumber(input.confirmedAt)},
    updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.id)} ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""};`);
  if (input.status !== current.status) recordPublicationIntentEvent(input.id, input.status, input.status, "", input.now);
  return getPublicationIntent(input.id);
}

export function createPublicationApproval(input: { id: number; now: number; source?: "human" | "automatic" }): PublicationIntent | null {
  command("BEGIN IMMEDIATE;");
  try {
    const current = getPublicationIntent(input.id);
    if (!current || current.status !== "pending_approval") { command("COMMIT;"); return null; }
    const draft = getDraft(current.draftId);
    if (!draft) throw new Error("approval draft not found");
    const expiresAt = approvalExpiry(draft, input.now);
    const snapshotId = recordApprovalSnapshot({ entityType: "publication_intent", entityId: current.id, draft,
      accountId: current.accountId, action: "post", text: current.text, mediaHash: current.mediaHash,
      source: input.source || "human", now: input.now, expiresAt });
    const updated = criticalRows<{ id: number }>(`UPDATE publication_intents SET status='approved',approved_at=${sqlNumber(input.now)},
      approval_expires_at=${sqlNumber(expiresAt)},approval_snapshot_id=${sqlNumber(snapshotId)},updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='pending_approval'
      ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""} RETURNING id;`);
    if (!updated.length) throw new Error("publication approval changed concurrently");
    recordPublicationIntentEvent(input.id, "approved", "approved", "", input.now);
    command("COMMIT;");
    return getPublicationIntent(input.id);
  } catch (error) { command("ROLLBACK;"); throw error; }
}

export function claimPublicationIntentDispatch(id: number, now: number): PublicationIntent | null {
  command("BEGIN IMMEDIATE;");
  try {
    const current = rows<{ id: number }>(`SELECT id FROM publication_intents
      WHERE id=${sqlNumber(id)} AND status='approved' ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""} LIMIT 1;`)[0];
    if (!current) {
      command("COMMIT;");
      return null;
    }
    command(`UPDATE publication_intents SET status='dispatching', dispatched_at=${sqlNumber(now)}, updated_at=${sqlNumber(now)}
      WHERE id=${sqlNumber(id)} AND status='approved' ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""};`);
    recordPublicationIntentEvent(id, "dispatch_claimed", "dispatching", "", now);
    command("COMMIT;");
    return getPublicationIntent(id);
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function claimPublicationIntentLease(input: { id: number; now: number; leaseSeconds?: number }): PublicationIntentLease | null {
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = criticalRows<{ id: number; draft_id: number }>(`UPDATE publication_intents SET status='expired',reason='approval_expired_requires_new_intent',lease_token=NULL,lease_until=NULL,updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='approved' AND remote_write_started_at IS NULL
        AND (approval_expires_at IS NULL OR approval_expires_at<=${sqlNumber(input.now)} OR NOT EXISTS
          (SELECT 1 FROM publication_approval_snapshots s WHERE s.id=publication_intents.approval_snapshot_id AND s.expires_at>${sqlNumber(input.now)})) RETURNING id,draft_id;`);
    for (const row of expired) { recordPublicationIntentEvent(row.id, "expired", "expired", "approval_expired", input.now); makeDraftReadyAfterExpiry(row.draft_id,input.now); }
    const candidate = rows<{ id: number }>(`SELECT intent.id FROM publication_intents AS intent
      INNER JOIN drafts AS d ON d.id=intent.draft_id
      WHERE intent.id=${sqlNumber(input.id)} AND intent.status='approved' AND intent.next_attempt_at<=${sqlNumber(input.now)}
        AND intent.approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s JOIN drafts d ON d.id=intent.draft_id
          WHERE s.id=intent.approval_snapshot_id AND s.entity_type='publication_intent' AND s.entity_id=intent.id AND s.expires_at>${sqlNumber(input.now)}
            AND s.text=intent.text AND s.text=d.text AND s.account_id IS intent.account_id AND s.action='post' AND s.format=d.format AND s.external_id=d.external_id
            AND s.source_handle=d.source_handle AND s.source_url=d.source_url AND s.media_hash=intent.media_hash)
        AND intent.attempts<intent.max_attempts AND (intent.lease_token IS NULL OR intent.lease_until<=${sqlNumber(input.now)})
        ${ownerClause ? `AND ${ownerClause}` : ""} LIMIT 1;`)[0];
    if (!candidate) {
      command("COMMIT;");
      return null;
    }
    const leaseToken = randomUUID();
    const leaseUntil = input.now + leaseSeconds;
    command(`UPDATE publication_intents SET status='dispatching', attempts=attempts+1,
      lease_token=${sqlString(leaseToken)}, lease_until=${sqlNumber(leaseUntil)}, heartbeat_at=${sqlNumber(input.now)},
      remote_write_started_at=NULL, updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(candidate.id)} AND status='approved'
      AND approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s JOIN drafts d ON d.id=publication_intents.draft_id
        WHERE s.id=publication_intents.approval_snapshot_id AND s.entity_type='publication_intent' AND s.entity_id=publication_intents.id AND s.expires_at>${sqlNumber(input.now)}
          AND s.text=publication_intents.text AND s.text=d.text AND s.account_id IS publication_intents.account_id AND s.action='post' AND s.format=d.format AND s.external_id=d.external_id
          AND s.source_handle=d.source_handle AND s.source_url=d.source_url AND s.media_hash=publication_intents.media_hash)
      AND attempts<max_attempts AND next_attempt_at<=${sqlNumber(input.now)}
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerClause})` : ""};`);
    recordPublicationIntentEvent(candidate.id, "dispatch_claimed", "dispatching", "", input.now);
    command("COMMIT;");
    const intent = getPublicationIntent(candidate.id);
    return intent ? { intent, leaseToken, leaseUntil } : null;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function renewPublicationIntentLease(input: { id: number; leaseToken: string; now: number; leaseSeconds?: number }): boolean {
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const updated = criticalRows<{ id: number }>(`UPDATE publication_intents SET lease_until=${sqlNumber(input.now + leaseSeconds)},
      heartbeat_at=${sqlNumber(input.now)}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='dispatching' AND lease_token=${sqlString(input.leaseToken)}
        AND lease_until>${sqlNumber(input.now)}
        ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (updated.length) recordPublicationIntentEvent(input.id, "heartbeat", "dispatching", "", input.now);
    command("COMMIT;");
    return updated.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function markPublicationIntentRequestSent(input: { id: number; leaseToken: string; now: number; accountLeaseToken?: string; authorization?: FinalSendAuthorization }): boolean {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = criticalRows<{ id: number; draft_id: number }>(`UPDATE publication_intents SET status='expired',reason='approval_expired_requires_new_intent',lease_token=NULL,lease_until=NULL,updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='dispatching' AND lease_token=${sqlString(input.leaseToken)}
        AND approval_expires_at<=${sqlNumber(input.now)} AND remote_write_started_at IS NULL RETURNING id,draft_id;`);
    for (const row of expired) { recordPublicationIntentEvent(row.id, "expired", "expired", "approval_expired", input.now); makeDraftReadyAfterExpiry(row.draft_id,input.now); }
    const updated = criticalRows<{ id: number }>(`UPDATE publication_intents SET remote_write_started_at=${sqlNumber(input.now)},
      dispatched_at=${sqlNumber(input.now)},
      updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.id)} AND status='dispatching'
        AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)} AND remote_write_started_at IS NULL
        AND approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s JOIN drafts d ON d.id=publication_intents.draft_id
        WHERE s.id=publication_intents.approval_snapshot_id AND s.entity_type='publication_intent' AND s.entity_id=publication_intents.id AND s.expires_at>${sqlNumber(input.now)}
            AND s.text=publication_intents.text AND s.text=d.text AND s.account_id IS publication_intents.account_id AND s.action='post' AND s.format=d.format
            AND s.external_id=d.external_id AND s.source_handle=d.source_handle AND s.source_url=d.source_url AND s.media_hash=publication_intents.media_hash)
        AND ${accountDispatchLeaseGuard("publication_intents.account_id", input.accountLeaseToken, input.now)}
        AND ${finalSendAuthorizationGuard(input.authorization, "publication_intents.account_id", "'post'", "publication_intents.approval_snapshot_id")}
        ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (updated.length) recordPublicationIntentEvent(input.id, "request_sent", "dispatching", "", input.now);
    command("COMMIT;");
    return updated.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function finishPublicationIntentLease(input: {
  id: number; leaseToken: string; outcome: "accepted" | "retryable_failure" | "permanent_failure" | "unknown_remote_state";
  accountLeaseToken?: string;
  now: number; reason?: string; receipt?: string; remoteUrl?: string; errorClass?: string; retryAfterSeconds?: number;
  remotePostId?: string;
  baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number;
}): PublicationIntent | null {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const current = rows<{ attempts: number; max_attempts: number; remote_write_started_at: number | null; account_id: number; approval_expires_at: number | null }>(`SELECT intent.attempts, intent.max_attempts, intent.remote_write_started_at, intent.account_id, intent.approval_expires_at FROM publication_intents AS intent
      INNER JOIN drafts AS d ON d.id=intent.draft_id
      WHERE intent.id=${sqlNumber(input.id)} AND intent.status='dispatching' AND intent.lease_token=${sqlString(input.leaseToken)}
        AND intent.lease_until>${sqlNumber(input.now)} AND ${accountDispatchLeaseGuard("intent.account_id", input.accountLeaseToken, input.now)}
        ${ownerClause ? `AND ${ownerClause}` : ""} LIMIT 1;`)[0];
    if (!current) {
      command("COMMIT;");
      return null;
    }
    if (input.outcome === "accepted" && current.remote_write_started_at === null) {
      command("COMMIT;");
      return null;
    }
    const errorClass = input.outcome === "accepted" ? "" : normalizedErrorClass(input.errorClass);
    let status: PublicationIntentStatus;
    let event: string;
    let nextAttemptAt = 0;
    let deadLetteredAt = "NULL";
    if (input.outcome === "accepted") { status = "pending_reconciliation"; event = "receipt_received"; }
    else if (input.outcome === "unknown_remote_state") { status = "reconciliation_required"; event = "reconcile_started"; }
    else if (input.outcome === "permanent_failure" || current.attempts >= current.max_attempts) {
      status = "dead_letter"; event = "dead_lettered"; deadLetteredAt = sqlNumber(input.now);
    } else if (current.approval_expires_at === null || current.approval_expires_at <= input.now) {
      status = "expired"; event = "expired";
    } else {
      status = "approved"; event = "retry_scheduled";
      const delay = Number.isFinite(input.retryAfterSeconds)
        ? Math.max(0, Math.min(86400, Math.floor(input.retryAfterSeconds!)))
        : retryDelaySeconds(current.attempts, { baseDelaySeconds: input.baseDelaySeconds, maxDelaySeconds: input.maxDelaySeconds, random: input.random });
      nextAttemptAt = input.now + delay;
    }
    const updated = criticalRows<{ id: number }>(`UPDATE publication_intents SET status=${sqlString(status)}, reason=${sqlString(input.reason || "")},
      receipt=${sqlString(input.receipt || "")}, remote_url=${sqlString(input.remoteUrl || "")}, remote_post_id=${sqlString(input.remotePostId || "")}, error_class=${sqlString(errorClass)},
      next_attempt_at=${sqlNumber(nextAttemptAt)}, dead_lettered_at=${deadLetteredAt}, lease_token=NULL, lease_until=NULL,
      updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.id)} AND status='dispatching'
        AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)}
        AND ${accountDispatchLeaseGuard("publication_intents.account_id", input.accountLeaseToken, input.now)}
        ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (!updated.length) {
      command("COMMIT;");
      return null;
    }
    recordPublicationIntentEvent(input.id, event, status, errorClass, input.now);
    command("COMMIT;");
    return getPublicationIntent(input.id);
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

/** Mark remote confirmation only after the transport accepted the request and X evidence identifies the post. */
export function confirmPublicationIntentRemote(input: { id: number; now: number; remotePostId?: string; remoteUrl?: string }): PublicationIntent | null {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const updated = criticalRows<{ id: number }>(`UPDATE publication_intents SET status='confirmed', confirmed_at=${sqlNumber(input.now)},
      remote_post_id=${sqlString(input.remotePostId || "")}, remote_url=${sqlString(input.remoteUrl || "")}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='pending_reconciliation' AND dispatched_at IS NOT NULL
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (!updated.length) { command("COMMIT;"); return null; }
    recordPublicationIntentEvent(input.id, "confirmed", "confirmed", "", input.now);
    command("COMMIT;");
    return getPublicationIntent(input.id);
  } catch (error) { command("ROLLBACK;"); throw error; }
}

export function recoverExpiredPublicationIntents(input: { now: number; baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number }): number {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = rows<{ id: number; draft_id: number; attempts: number; max_attempts: number; remote_write_started_at: number | null; approval_expires_at: number | null }>(`SELECT intent.id,intent.draft_id,intent.attempts,intent.max_attempts,intent.remote_write_started_at,intent.approval_expires_at
      FROM publication_intents AS intent INNER JOIN drafts AS d ON d.id=intent.draft_id
      WHERE intent.status='dispatching' AND intent.lease_until IS NOT NULL AND intent.lease_until<=${sqlNumber(input.now)}
        ${ownerClause ? `AND ${ownerClause}` : ""} ORDER BY intent.lease_until, intent.id;`);
    for (const intent of expired) {
      const ambiguous = intent.remote_write_started_at !== null;
      const dead = !ambiguous && intent.attempts >= intent.max_attempts;
      const approvalExpired = !ambiguous && (intent.approval_expires_at === null || intent.approval_expires_at <= input.now);
      const status: PublicationIntentStatus = ambiguous ? "reconciliation_required" : approvalExpired ? "expired" : dead ? "dead_letter" : "approved";
      const event = ambiguous ? "reconcile_started" : approvalExpired ? "expired" : dead ? "dead_lettered" : "retry_scheduled";
      const errorClass = ambiguous ? "unknown_remote_state" : approvalExpired ? "approval_expired" : "lease_expired";
      const nextAttemptAt = status === "approved" ? input.now + retryDelaySeconds(intent.attempts, input) : 0;
      command(`UPDATE publication_intents SET status=${sqlString(status)}, error_class=${sqlString(errorClass)}, reason=${sqlString(errorClass)},
        next_attempt_at=${sqlNumber(nextAttemptAt)}, dead_lettered_at=${dead ? sqlNumber(input.now) : "NULL"}, lease_token=NULL,
        lease_until=NULL, updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(intent.id)} AND status='dispatching'
        AND lease_until<=${sqlNumber(input.now)};`);
      recordPublicationIntentEvent(intent.id, event, status, errorClass, input.now);
      if (approvalExpired) makeDraftReadyAfterExpiry(intent.draft_id,input.now);
    }
    command("COMMIT;");
    return expired.length;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function recoverStalePublicationIntent(
  id: number,
  cutoff: number,
  status: PublicationIntentStatus,
  reason: string,
  now: number,
): PublicationIntent | null {
  command("BEGIN IMMEDIATE;");
  try {
    const stale = rows<{ id: number }>(`SELECT id FROM publication_intents
      WHERE id=${sqlNumber(id)} AND status='dispatching' AND lease_token IS NULL AND updated_at<=${sqlNumber(cutoff)} ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""} LIMIT 1;`)[0];
    if (!stale) {
      command("COMMIT;");
      return null;
    }
    command(`UPDATE publication_intents SET status=${sqlString(status)}, reason=${sqlString(reason)}, updated_at=${sqlNumber(now)}
      WHERE id=${sqlNumber(id)} AND status='dispatching' AND lease_token IS NULL AND updated_at<=${sqlNumber(cutoff)} ${currentOwnerId() ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=publication_intents.draft_id AND ${ownerSql("d.owner_user_id")})` : ""};`);
    recordPublicationIntentEvent(id, status, status, "stale_dispatch", now);
    command("COMMIT;");
    return getPublicationIntent(id);
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function syncIntentPublication(intentId: number, now: number): void {
  const intent = getPublicationIntent(intentId);
  if (!intent || intent.status !== "confirmed" || intent.dispatchedAt === null) return;
  const draft = getDraft(intent.draftId);
  if (!draft) return;
  const clusterKeyValue = draft.externalId ? getPost(draft.externalId)?.clusterKey || `draft:${draft.id}` : `draft:${draft.id}`;
  command(`INSERT INTO opportunity_clusters (cluster_key, first_seen_at, last_seen_at)
    VALUES (${sqlString(clusterKeyValue)}, ${sqlNumber(now)}, ${sqlNumber(now)}) ON CONFLICT(cluster_key) DO UPDATE SET last_seen_at=excluded.last_seen_at;`);
  const cluster = criticalRows<{ id: number }>(`SELECT id FROM opportunity_clusters WHERE cluster_key=${sqlString(clusterKeyValue)} LIMIT 1;`)[0];
  if (!cluster) throw new Error("publication cluster oluşturulamadı");
  if (draft.externalId) command(`INSERT OR IGNORE INTO cluster_observations (cluster_id, post_external_id, observed_at) VALUES (${sqlNumber(cluster.id)}, ${sqlString(draft.externalId)}, ${sqlNumber(now)});`);
  command(`INSERT INTO account_opportunities (cluster_id, account_id, status, created_at, updated_at)
    VALUES (${sqlNumber(cluster.id)}, ${sqlNumber(intent.accountId)}, 'confirmed', ${sqlNumber(now)}, ${sqlNumber(now)})
    ON CONFLICT(cluster_id, account_id) DO UPDATE SET status='confirmed', updated_at=excluded.updated_at;`);
  const opportunity = criticalRows<{ id: number }>(`SELECT id FROM account_opportunities WHERE cluster_id=${sqlNumber(cluster.id)} AND account_id=${sqlNumber(intent.accountId)} LIMIT 1;`)[0];
  if (!opportunity) throw new Error("publication opportunity oluşturulamadı");
  const remoteId = remotePostId(intent.remoteUrl);
  command(`INSERT INTO publications (
      cluster_id, account_opportunity_id, account_id, source_observation_external_id, remote_post_id, remote_url,
      status, requested_at, confirmed_at, draft_id, publication_intent_id
    ) VALUES (
      ${sqlNumber(cluster.id)}, ${sqlNumber(opportunity.id)}, ${sqlNumber(intent.accountId)}, ${sqlString(draft.externalId)},
      ${sqlString(remoteId)}, ${sqlString(intent.remoteUrl)}, 'confirmed', ${sqlNumber(intent.requestedAt)}, ${sqlNumber(now)},
      ${sqlNumber(draft.id)}, ${sqlNumber(intent.id)}
    ) ON CONFLICT(account_opportunity_id) DO UPDATE SET remote_post_id=excluded.remote_post_id, remote_url=excluded.remote_url,
      status='confirmed', confirmed_at=excluded.confirmed_at, draft_id=excluded.draft_id, publication_intent_id=excluded.publication_intent_id;`);
}

export function confirmPublicationIntentAttempt(intentId: number, now: number): void {
  const intent = getPublicationIntent(intentId);
  if (!intent || intent.status !== "confirmed" || intent.dispatchedAt === null) return;
  const draft = getDraft(intent.draftId);
  const externalId = draft?.externalId || `intent:${intent.id}`;
  const attempt = rows<{ id: number }>(`SELECT id FROM publish_attempts
    WHERE post_external_id=${sqlString(externalId)} AND account_id=${sqlNumber(intent.accountId)}
      AND publication_intent_id=${sqlNumber(intent.id)}
      AND status='pending_reconciliation' ORDER BY id DESC LIMIT 1;`)[0];
  if (!attempt) return;
  exec(`UPDATE publish_attempts SET status='confirmed', reason='FxTwitter reconciliation confirmed', updated_at=${sqlNumber(now)}
    WHERE id=${sqlNumber(attempt.id)};`);
}

export function createDraft(input: {
  batchId?: string;
  origin?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  variantMode?: string;
  externalId: string;
  accountId?: number | null;
  format: string;
  text: string;
  status?: string;
  gateReason?: string;
  sourceHandle?: string;
  sourceUrl?: string;
  sourceScore?: number;
  now: number;
}): DraftRecord {
  requireValidOptionalAccount(input.accountId);
  const ownerId = currentOwnerId();
  if (input.batchId && ownerId !== undefined && !getDraftBatch(input.batchId)) throw new Error("draft batch not found");
  exec(`INSERT INTO drafts (batch_id, origin, prompt, provider, model, variant_mode, source_handle, source_url, source_score,
      external_id, account_id, format, text, status, gate_reason, owner_user_id, created_at, updated_at)
    VALUES (${sqlString(input.batchId || "")}, ${sqlString(input.origin || "manual")},
      ${sqlString(input.prompt || "")}, ${sqlString(input.provider || "")}, ${sqlString(input.model || "")},
      ${sqlString(input.variantMode || "same_text")}, ${sqlString(input.sourceHandle || "")},
      ${sqlString(input.sourceUrl || "")}, ${Number.isFinite(input.sourceScore) ? input.sourceScore : 0},
      ${sqlString(input.externalId)}, ${input.accountId ? sqlNumber(input.accountId) : "NULL"},
      ${sqlString(input.format)}, ${sqlString(input.text)}, ${sqlString(input.status || "draft")},
      ${sqlString(input.gateReason || "")}, ${ownerId === undefined ? "NULL" : sqlString(ownerId)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
  const result = getDrafts(100).sort((left, right) => right.id - left.id)[0];
  if (!result) throw new Error("draft could not be created");
  return result;
}

export function updateDraft(input: {
  id: number;
  accountId?: number | null;
  format?: string;
  text?: string;
  status?: string;
  gateReason?: string;
  sourceHandle?: string;
  sourceUrl?: string;
  now: number;
}): DraftRecord | null {
  const current = getDraft(input.id);
  if (!current) return null;
  requireValidOptionalAccount(input.accountId);
  const accountSql = input.accountId === undefined ? "account_id" : input.accountId === null ? "NULL" : sqlNumber(input.accountId);
  const contentChanged = (input.accountId !== undefined && input.accountId !== current.accountId)
    || (input.format !== undefined && input.format !== current.format)
    || (input.text !== undefined && input.text !== current.text)
    || (input.sourceHandle !== undefined && input.sourceHandle !== current.sourceHandle)
    || (input.sourceUrl !== undefined && input.sourceUrl !== current.sourceUrl);
  command("BEGIN IMMEDIATE;");
  try {
    if (contentChanged) {
      const unresolved = criticalRows<{ id: number }>(`SELECT id FROM automation_jobs WHERE draft_id=${sqlNumber(input.id)}
        AND remote_write_started_at IS NOT NULL AND status NOT IN ('confirmed','cancelled')
        UNION ALL SELECT id FROM publication_intents WHERE draft_id=${sqlNumber(input.id)}
        AND remote_write_started_at IS NOT NULL AND status NOT IN ('confirmed','cancelled') LIMIT 1;`);
      if (unresolved.length) throw new Error("Remote publication must be reconciled before editing this draft");
      const invalidatedIntents = criticalRows<{ id: number }>(`UPDATE publication_intents SET status='cancelled',reason='draft_revision_changed',approved_at=NULL,
        lease_token=NULL,lease_until=NULL,updated_at=${sqlNumber(input.now)}
        WHERE draft_id=${sqlNumber(input.id)} AND remote_write_started_at IS NULL
        AND status IN ('pending_approval','approved','blocked','dispatching','dead_letter') RETURNING id;`);
      const invalidatedJobs = criticalRows<{ id: number }>(`UPDATE automation_jobs SET status='cancelled',reason='draft_revision_changed',lease_token=NULL,lease_until=NULL,
        updated_at=${sqlNumber(input.now)} WHERE draft_id=${sqlNumber(input.id)} AND remote_write_started_at IS NULL
        AND status IN ('queued','scheduled','blocked','running','dead_letter') RETURNING id;`);
      for (const intent of invalidatedIntents) recordPublicationIntentEvent(intent.id, 'cancelled', 'cancelled', 'draft_revision_changed', input.now);
      for (const job of invalidatedJobs) recordAutomationJobEvent(job.id, 'cancelled', 'cancelled', 'draft_revision_changed', input.now);
    }
    command(`UPDATE drafts SET account_id=${accountSql}, format=${sqlString(input.format ?? current.format)},
      text=${sqlString(input.text ?? current.text)}, status=${sqlString(contentChanged ? "draft" : input.status ?? current.status)},
      gate_reason=${sqlString(input.gateReason ?? current.gateReason)},
      source_handle=${sqlString(input.sourceHandle ?? current.sourceHandle)},
      source_url=${sqlString(input.sourceUrl ?? current.sourceUrl)}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""};`);
    command("COMMIT;");
  } catch (error) { command("ROLLBACK;"); throw error; }
  return getDraft(input.id);
}

export function deleteDraft(id: number): boolean {
  if (!getDraft(id)) return false;
  const retained = rows<{ id: number }>(`SELECT id FROM automation_jobs WHERE draft_id=${sqlNumber(id)}
    UNION ALL SELECT id FROM publication_intents WHERE draft_id=${sqlNumber(id)} LIMIT 1;`);
  if (retained.length || hasTable("draft_revisions") && rows<{ id: number }>(`SELECT id FROM draft_revisions WHERE draft_id=${sqlNumber(id)} LIMIT 1;`).length) return false;
  exec(`DELETE FROM automation_jobs WHERE draft_id=${sqlNumber(id)};
    DELETE FROM draft_variants WHERE draft_id=${sqlNumber(id)};
    DELETE FROM draft_evaluations WHERE draft_id=${sqlNumber(id)};
    DELETE FROM drafts WHERE id=${sqlNumber(id)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""};`);
  return !getDraft(id);
}

type AutomationJobRow = {
    id: number;
    draft_id: number;
    account_id: number | null;
    handle: string | null;
    action: string;
    scheduled_at: number;
    status: string;
    receipt: string;
    reason: string;
    remote_url: string;
    reconciliation_status: string;
    attempts: number;
    max_attempts: number;
    lease_token: string | null;
    lease_until: number | null;
    heartbeat_at: number | null;
    next_attempt_at: number;
    error_class: string;
    dead_lettered_at: number | null;
    approval_expires_at: number | null;
    approval_snapshot_id: number | null;
    remote_write_started_at: number | null;
    created_at: number;
    updated_at: number;
};

function automationJob(row: AutomationJobRow): AutomationJob {
  return {
    id: row.id,
    draftId: row.draft_id,
    accountId: row.account_id,
    accountHandle: row.handle || "atanmamış",
    action: row.action,
    scheduledAt: row.scheduled_at,
    status: row.status,
    receipt: row.receipt,
    reason: row.reason,
    remoteUrl: row.remote_url || "",
    reconciliationStatus: row.reconciliation_status || "not_started",
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseToken: row.lease_token,
    leaseUntil: row.lease_until,
    heartbeatAt: row.heartbeat_at,
    nextAttemptAt: row.next_attempt_at,
    errorClass: row.error_class,
    deadLetteredAt: row.dead_lettered_at,
    approvalExpiresAt: row.approval_expires_at,
    approvalSnapshotId: row.approval_snapshot_id,
    remoteWriteStartedAt: row.remote_write_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const AUTOMATION_JOB_SELECT = `SELECT automation_jobs.id, draft_id, automation_jobs.account_id, accounts.handle,
      action, scheduled_at, automation_jobs.status, receipt, automation_jobs.reason,
      remote_url, reconciliation_status,
      attempts, max_attempts, lease_token, lease_until, heartbeat_at, next_attempt_at, error_class, approval_expires_at, approval_snapshot_id,
      dead_lettered_at, remote_write_started_at, automation_jobs.created_at, automation_jobs.updated_at
      FROM automation_jobs LEFT JOIN accounts ON accounts.id=automation_jobs.account_id
      INNER JOIN drafts AS job_draft ON job_draft.id=automation_jobs.draft_id`;

export function getJob(id: number): AutomationJob | null {
  const row = rows<AutomationJobRow>(`${AUTOMATION_JOB_SELECT} WHERE automation_jobs.id=${sqlNumber(id)} ${ownerSql("job_draft.owner_user_id") ? `AND ${ownerSql("job_draft.owner_user_id")}` : ""} LIMIT 1;`)[0];
  return row ? automationJob(row) : null;
}

export function getStaleRunningJobs(cutoff: number, limit = 100): AutomationJob[] {
  return rows<AutomationJobRow>(`${AUTOMATION_JOB_SELECT}
    WHERE automation_jobs.status='running' AND automation_jobs.lease_token IS NULL AND automation_jobs.updated_at<=${sqlNumber(cutoff)} ${ownerSql("job_draft.owner_user_id") ? `AND ${ownerSql("job_draft.owner_user_id")}` : ""}
    ORDER BY automation_jobs.updated_at ASC, automation_jobs.id ASC LIMIT ${sqlNumber(Math.max(1, Math.min(500, limit)))};`).map(automationJob);
}

export function getJobs(limit = 100): AutomationJob[] {
  return rows<AutomationJobRow>(`${AUTOMATION_JOB_SELECT}
      ${ownerSql("job_draft.owner_user_id") ? `WHERE ${ownerSql("job_draft.owner_user_id")}` : ""}
      ORDER BY scheduled_at ASC, automation_jobs.id DESC LIMIT ${sqlNumber(limit)};`).map(automationJob);
}

export function readPublicationPolicyHistory(input: { excludeIntentId?: number; excludeJobId?: number; since: number }): PublicationPolicyHistoryRow[] {
  if (!Number.isFinite(input.since)) throw new Error("policy history since must be finite");
  const accountOwner = ownerSql("accounts.owner_user_id");
  const draftOwner = ownerSql("d.owner_user_id");
  const intents = rows<PublicationPolicyHistoryRow>(`SELECT 'publication_intent' AS recordType,intent.id AS recordId,intent.account_id AS accountId,
      intent.status AS status,COALESCE(NULLIF(d.format,''),'post') AS action,COALESCE(intent.text,d.text,'') AS text,
      COALESCE((SELECT p.cluster_id FROM publications p WHERE p.publication_intent_id=intent.id LIMIT 1),
        (SELECT co.cluster_id FROM cluster_observations co WHERE co.post_external_id=d.external_id LIMIT 1)) AS clusterId,
      COALESCE(d.source_handle,'') AS sourceHandle,
      CASE WHEN COALESCE(d.format,'') IN ('reply','repost','quote') THEN COALESCE(d.external_id,'') ELSE '' END AS targetId,
      intent.requested_at AS createdAt,intent.updated_at AS updatedAt,intent.remote_write_started_at AS sendStartedAt,
      intent.confirmed_at AS confirmedAt,CASE WHEN intent.status='confirmed' THEN intent.confirmed_at ELSE NULL END AS publishedAt,
      CASE WHEN intent.remote_write_started_at IS NOT NULL OR intent.status IN ('dispatching','pending_reconciliation','confirmed','reconciliation_required') THEN 1 ELSE 0 END AS potentialBudgetUsed
    FROM publication_intents intent JOIN accounts ON accounts.id=intent.account_id JOIN drafts d ON d.id=intent.draft_id
    WHERE intent.status IN ('dispatching','pending_reconciliation','confirmed','reconciliation_required')
      AND (intent.requested_at>=${sqlNumber(input.since)} OR intent.updated_at>=${sqlNumber(input.since)} OR intent.remote_write_started_at>=${sqlNumber(input.since)} OR intent.confirmed_at>=${sqlNumber(input.since)})
      ${input.excludeIntentId ? `AND intent.id<>${sqlNumber(input.excludeIntentId)}` : ""}
      ${accountOwner ? `AND ${accountOwner}` : ""} ${draftOwner ? `AND ${draftOwner}` : ""};`);
  const jobs = rows<PublicationPolicyHistoryRow>(`SELECT 'automation_job' AS recordType,job.id AS recordId,job.account_id AS accountId,
      job.status AS status,job.action AS action,COALESCE(d.text,'') AS text,
      (SELECT co.cluster_id FROM cluster_observations co WHERE co.post_external_id=d.external_id LIMIT 1) AS clusterId,
      COALESCE(d.source_handle,'') AS sourceHandle,
      CASE WHEN job.action IN ('reply','repost','quote') THEN COALESCE(d.external_id,'') ELSE '' END AS targetId,
      job.created_at AS createdAt,job.updated_at AS updatedAt,job.remote_write_started_at AS sendStartedAt,
      CASE WHEN job.status='confirmed' THEN job.updated_at ELSE NULL END AS confirmedAt,
      CASE WHEN job.status='confirmed' THEN job.updated_at ELSE NULL END AS publishedAt,
      CASE WHEN job.remote_write_started_at IS NOT NULL OR job.status IN ('running','pending_reconciliation','confirmed','reconciliation_required','succeeded','submitted') THEN 1 ELSE 0 END AS potentialBudgetUsed
    FROM automation_jobs job JOIN accounts ON accounts.id=job.account_id JOIN drafts d ON d.id=job.draft_id
    WHERE job.action IN ('post','reply','repost','quote') AND job.status IN ('running','pending_reconciliation','confirmed','reconciliation_required','succeeded','submitted')
      AND (job.created_at>=${sqlNumber(input.since)} OR job.updated_at>=${sqlNumber(input.since)} OR job.remote_write_started_at>=${sqlNumber(input.since)})
      ${input.excludeJobId ? `AND job.id<>${sqlNumber(input.excludeJobId)}` : ""}
      ${accountOwner ? `AND ${accountOwner}` : ""} ${draftOwner ? `AND ${draftOwner}` : ""};`);
  return [...intents, ...jobs].sort((a,b)=>(b.sendStartedAt ?? b.confirmedAt ?? b.updatedAt ?? b.createdAt)-(a.sendStartedAt ?? a.confirmedAt ?? a.updatedAt ?? a.createdAt));
}

export function createJob(input: {
  draftId: number;
  accountId?: number | null;
  action: string;
  scheduledAt: number;
  maxAttempts?: number;
  approvalSource?: "human" | "automatic";
  now: number;
}): AutomationJob {
  const draft = getDraft(input.draftId);
  if (!draft) throw new Error("draft not found");
  requireValidOptionalAccount(input.accountId);
  if (draft.accountId && input.accountId && draft.accountId !== input.accountId) throw new Error("job account does not match draft");
  const accountSql = input.accountId ? sqlNumber(input.accountId) : "NULL";
  const existing = rows<{ id: number }>(`SELECT id FROM automation_jobs
    WHERE draft_id=${sqlNumber(input.draftId)} AND account_id IS ${input.accountId ? "NOT NULL" : "NULL"}
      ${input.accountId ? `AND account_id=${accountSql}` : ""}
      AND action=${sqlString(input.action)}
      AND status IN ('queued','running','submitted','pending_reconciliation')
    ORDER BY id DESC LIMIT 1;`)[0];
  if (existing) {
    const current = getJob(existing.id);
    if (current) return current;
  }
  const maxAttempts = Math.max(1, Math.min(20, Math.floor(input.maxAttempts || 5)));
  exec(`INSERT INTO automation_jobs (draft_id, account_id, action, scheduled_at, max_attempts, created_at, updated_at)
    VALUES (${sqlNumber(input.draftId)}, ${accountSql},
      ${sqlString(input.action)}, ${sqlNumber(input.scheduledAt)}, ${sqlNumber(maxAttempts)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
  const id = Number(rows<{ id: number }>("SELECT last_insert_rowid() AS id;")[0]?.id);
  const expiresAt = approvalExpiry(draft, input.now);
  const approvalSnapshotId = recordApprovalSnapshot({ entityType: "automation_job", entityId: id, draft,
    accountId: input.accountId || draft.accountId || null, action: input.action, text: draft.text,
    source: input.approvalSource || "human", now: input.now, expiresAt });
  exec(`UPDATE automation_jobs SET approval_expires_at=${sqlNumber(expiresAt)},approval_snapshot_id=${sqlNumber(approvalSnapshotId)} WHERE id=${sqlNumber(id)};`);
  recordAutomationJobEvent(id, "created", "queued", "", input.now);
  recordAutomationJobEvent(id, "scheduled", "queued", "", input.now);
  const result = getJob(id);
  if (!result) throw new Error("job could not be created");
  return result;
}

function recordAutomationJobEvent(jobId: number, event: string, status: string, errorClass: string, now: number): void {
  exec(`INSERT INTO automation_job_events (job_id, event, status, error_class, created_at)
    VALUES (${sqlNumber(jobId)}, ${sqlString(event)}, ${sqlString(status)}, ${sqlString(errorClass)}, ${sqlNumber(now)});`);
}

function makeDraftReadyAfterExpiry(draftId: number, now: number): void {
  exec(`UPDATE drafts SET status='ready',updated_at=${sqlNumber(now)} WHERE id=${sqlNumber(draftId)} AND status IN ('queued','pending_approval')
    AND NOT EXISTS (SELECT 1 FROM automation_jobs WHERE draft_id=${sqlNumber(draftId)} AND status IN ('queued','failed','running','pending_reconciliation'))
    AND NOT EXISTS (SELECT 1 FROM publication_intents WHERE draft_id=${sqlNumber(draftId)} AND status IN ('pending_approval','approved','dispatching','pending_reconciliation'));`);
}

export function getAutomationJobEvents(jobId: number): AutomationJobEvent[] {
  if (!getJob(jobId)) return [];
  return rows<AutomationJobEvent>(`SELECT events.id, events.job_id AS jobId, events.event, events.status, events.error_class AS errorClass, events.created_at AS createdAt
    FROM automation_job_events AS events INNER JOIN automation_jobs AS job ON job.id=events.job_id
    INNER JOIN drafts ON drafts.id=job.draft_id
    WHERE events.job_id=${sqlNumber(jobId)} ${ownerSql("drafts.owner_user_id") ? `AND ${ownerSql("drafts.owner_user_id")}` : ""}
    ORDER BY events.id;`);
}

export function retryDelaySeconds(attempt: number, input: { baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number } = {}): number {
  const base = Math.max(1, Math.min(3600, Math.floor(input.baseDelaySeconds ?? 5)));
  const max = Math.max(base, Math.min(86400, Math.floor(input.maxDelaySeconds ?? 3600)));
  const jitter = Math.max(0, Math.min(1, Number((input.random || Math.random)())));
  const exponential = Math.min(max, base * 2 ** Math.max(0, Math.min(30, Math.floor(attempt) - 1)));
  return Math.min(max, exponential + Math.floor(jitter * base));
}

function normalizedErrorClass(value: string | undefined): string {
  return (value || "unknown").replace(/[^a-z0-9_.-]/giu, "_").slice(0, 80) || "unknown";
}

export function claimAutomationJobLease(input: { id: number; now: number; leaseSeconds?: number }): AutomationJobLease | null {
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = criticalRows<{ id: number; draft_id: number }>(`UPDATE automation_jobs SET status='expired',reason='approval_expired_requires_new_intent',lease_token=NULL,lease_until=NULL,updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status IN ('queued','failed') AND remote_write_started_at IS NULL
        AND (approval_expires_at IS NULL OR approval_expires_at<=${sqlNumber(input.now)} OR NOT EXISTS
          (SELECT 1 FROM publication_approval_snapshots s WHERE s.id=automation_jobs.approval_snapshot_id AND s.expires_at>${sqlNumber(input.now)})) RETURNING id,draft_id;`);
    for (const row of expired) { recordAutomationJobEvent(row.id, "expired", "expired", "approval_expired", input.now); makeDraftReadyAfterExpiry(row.draft_id,input.now); }
    const candidate = rows<{ id: number }>(`SELECT job.id FROM automation_jobs AS job
      INNER JOIN drafts AS d ON d.id=job.draft_id
      WHERE job.id=${sqlNumber(input.id)} AND job.status IN ('queued','failed')
        AND job.approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s
          WHERE s.id=job.approval_snapshot_id AND s.entity_type='automation_job' AND s.entity_id=job.id AND s.expires_at>${sqlNumber(input.now)}
            AND s.text=(SELECT text FROM drafts WHERE id=job.draft_id) AND s.account_id IS job.account_id AND s.action=job.action
            AND s.format=(SELECT format FROM drafts WHERE id=job.draft_id) AND s.external_id=(SELECT external_id FROM drafts WHERE id=job.draft_id)
            AND s.source_handle=(SELECT source_handle FROM drafts WHERE id=job.draft_id) AND s.source_url=(SELECT source_url FROM drafts WHERE id=job.draft_id))
        AND job.scheduled_at<=${sqlNumber(input.now)} AND job.next_attempt_at<=${sqlNumber(input.now)}
        AND job.attempts<job.max_attempts AND (job.lease_token IS NULL OR job.lease_until<=${sqlNumber(input.now)})
        ${ownerClause ? `AND ${ownerClause}` : ""} LIMIT 1;`)[0];
    if (!candidate) {
      command("COMMIT;");
      return null;
    }
    const leaseToken = randomUUID();
    const leaseUntil = input.now + leaseSeconds;
    command(`UPDATE automation_jobs SET status='running', attempts=attempts+1, lease_token=${sqlString(leaseToken)},
      lease_until=${sqlNumber(leaseUntil)}, heartbeat_at=${sqlNumber(input.now)}, remote_write_started_at=NULL,
      updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(candidate.id)} AND status IN ('queued','failed')
      AND approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s JOIN drafts d ON d.id=automation_jobs.draft_id
        WHERE s.id=automation_jobs.approval_snapshot_id AND s.entity_type='automation_job' AND s.entity_id=automation_jobs.id AND s.expires_at>${sqlNumber(input.now)}
          AND s.text=d.text AND s.account_id IS automation_jobs.account_id AND s.action=automation_jobs.action AND s.format=d.format
          AND s.external_id=d.external_id AND s.source_handle=d.source_handle AND s.source_url=d.source_url)
      AND attempts<max_attempts AND scheduled_at<=${sqlNumber(input.now)} AND next_attempt_at<=${sqlNumber(input.now)}
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerClause})` : ""};`);
    recordAutomationJobEvent(candidate.id, "reserved", "running", "", input.now);
    command("COMMIT;");
    const job = getJob(candidate.id);
    return job ? { job, leaseToken, leaseUntil } : null;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function renewAutomationJobLease(input: { id: number; leaseToken: string; now: number; leaseSeconds?: number }): boolean {
  const leaseSeconds = Math.max(10, Math.min(3600, Math.floor(input.leaseSeconds ?? 60)));
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const renewed = criticalRows<{ id: number }>(`UPDATE automation_jobs SET lease_until=${sqlNumber(input.now + leaseSeconds)}, heartbeat_at=${sqlNumber(input.now)}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='running' AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)}
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (renewed.length) recordAutomationJobEvent(input.id, "heartbeat", "running", "", input.now);
    command("COMMIT;");
    return renewed.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function markAutomationJobRequestSent(input: { id: number; leaseToken: string; now: number; accountLeaseToken?: string; authorization?: FinalSendAuthorization }): boolean {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = criticalRows<{ id: number; draft_id: number }>(`UPDATE automation_jobs SET status='expired',reason='approval_expired_requires_new_intent',lease_token=NULL,lease_until=NULL,updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='running' AND lease_token=${sqlString(input.leaseToken)}
        AND approval_expires_at<=${sqlNumber(input.now)} AND remote_write_started_at IS NULL RETURNING id,draft_id;`);
    for (const row of expired) { recordAutomationJobEvent(row.id, "expired", "expired", "approval_expired", input.now); makeDraftReadyAfterExpiry(row.draft_id,input.now); }
    const marked = criticalRows<{ id: number }>(`UPDATE automation_jobs SET remote_write_started_at=${sqlNumber(input.now)}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='running' AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)} AND remote_write_started_at IS NULL
      AND approval_expires_at>${sqlNumber(input.now)} AND EXISTS (SELECT 1 FROM publication_approval_snapshots s JOIN drafts d ON d.id=automation_jobs.draft_id
        WHERE s.id=automation_jobs.approval_snapshot_id AND s.entity_type='automation_job' AND s.entity_id=automation_jobs.id AND s.expires_at>${sqlNumber(input.now)}
          AND s.text=d.text AND s.account_id IS automation_jobs.account_id AND s.action=automation_jobs.action AND s.format=d.format
          AND s.external_id=d.external_id AND s.source_handle=d.source_handle AND s.source_url=d.source_url)
      AND ${accountDispatchLeaseGuard("automation_jobs.account_id", input.accountLeaseToken, input.now)}
      AND ${finalSendAuthorizationGuard(input.authorization, "automation_jobs.account_id", "automation_jobs.action", "automation_jobs.approval_snapshot_id")}
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (marked.length) recordAutomationJobEvent(input.id, "request_sent", "running", "", input.now);
    command("COMMIT;");
    return marked.length > 0;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function finishAutomationJobLease(input: {
  id: number; leaseToken: string; outcome: "accepted" | "success" | "retryable_failure" | "permanent_failure" | "unknown_remote_state";
  accountLeaseToken?: string;
  now: number; receipt?: string; remoteUrl?: string; errorClass?: string; reason?: string; retryAfterSeconds?: number; baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number;
}): AutomationJob | null {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const current = rows<{ attempts: number; max_attempts: number; remote_write_started_at: number | null; account_id: number | null }>(`SELECT job.attempts, job.max_attempts, job.remote_write_started_at, job.account_id
      FROM automation_jobs AS job INNER JOIN drafts AS d ON d.id=job.draft_id
      WHERE job.id=${sqlNumber(input.id)} AND job.status='running' AND job.lease_token=${sqlString(input.leaseToken)}
        AND job.lease_until>${sqlNumber(input.now)} AND ${accountDispatchLeaseGuard("job.account_id", input.accountLeaseToken, input.now)}
        ${ownerClause ? `AND ${ownerClause}` : ""} LIMIT 1;`)[0];
    if (!current || input.outcome === "accepted" && current.remote_write_started_at === null) {
      command("COMMIT;");
      return null;
    }
    const errorClass = input.outcome === "success" || input.outcome === "accepted" ? "" : normalizedErrorClass(input.errorClass);
    let status: string;
    let event: string;
    let nextAttemptAt = 0;
    let deadLetteredAt = "NULL";
    let reconciliationStatus = "reconciliation_status";
    if (input.outcome === "accepted") {
      status = "pending_reconciliation"; event = "receipt_received"; reconciliationStatus = "'pending'";
    } else if (input.outcome === "success") {
      status = "succeeded";
      event = "completed";
    } else if (input.outcome === "unknown_remote_state") {
      status = "reconciliation_required";
      event = "reconcile_started";
      reconciliationStatus = "'required'";
    } else if (input.outcome === "permanent_failure" || current.attempts >= current.max_attempts) {
      status = "dead_letter";
      event = "dead_lettered";
      deadLetteredAt = sqlNumber(input.now);
    } else {
      status = "queued";
      event = "retry_scheduled";
      const delay = Number.isFinite(input.retryAfterSeconds)
        ? Math.max(0, Math.min(86400, Math.floor(input.retryAfterSeconds!)))
        : retryDelaySeconds(current.attempts, { baseDelaySeconds: input.baseDelaySeconds, maxDelaySeconds: input.maxDelaySeconds, random: input.random });
      nextAttemptAt = input.now + delay;
    }
    const finished = criticalRows<{ id: number }>(`UPDATE automation_jobs SET status=${sqlString(status)}, reason=${sqlString(input.reason || "")},
      receipt=${input.receipt === undefined ? "receipt" : sqlString(input.receipt)}, remote_url=${input.remoteUrl === undefined ? "remote_url" : sqlString(input.remoteUrl)},
      error_class=${sqlString(errorClass)}, next_attempt_at=${sqlNumber(nextAttemptAt)}, dead_lettered_at=${deadLetteredAt},
      reconciliation_status=${reconciliationStatus}, lease_token=NULL, lease_until=NULL, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='running' AND lease_token=${sqlString(input.leaseToken)} AND lease_until>${sqlNumber(input.now)}
      AND ${accountDispatchLeaseGuard("automation_jobs.account_id", input.accountLeaseToken, input.now)}
      ${ownerClause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerClause})` : ""} RETURNING id;`);
    if (!finished.length) {
      command("COMMIT;");
      return null;
    }
    recordAutomationJobEvent(input.id, event, status, errorClass, input.now);
    command("COMMIT;");
    return getJob(input.id);
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function markAutomationJobReconciliationRequired(input: { id: number; now: number; reason: string }): AutomationJob | null {
  const clause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const changed = criticalRows<{ id: number }>(`UPDATE automation_jobs SET status='reconciliation_required', reconciliation_status='required',
      reason=${sqlString(input.reason)}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status='pending_reconciliation' AND remote_write_started_at IS NOT NULL
      ${clause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${clause})` : ""} RETURNING id;`);
    if (changed.length) recordAutomationJobEvent(input.id,"reconcile_started","reconciliation_required","",input.now);
    command("COMMIT;");return changed.length?getJob(input.id):null;
  } catch (error) {command("ROLLBACK;");throw error;}
}

/** Called only after authenticated remote evidence has been verified by reconciliation. */
export function confirmAutomationJobRemote(input: { id: number; now: number; receipt?: string; remoteUrl?: string }): AutomationJob | null {
  const clause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const confirmed = criticalRows<{ id: number }>(`UPDATE automation_jobs SET status='confirmed', reconciliation_status='confirmed',
      receipt=${input.receipt === undefined ? "receipt" : sqlString(input.receipt)}, remote_url=${input.remoteUrl === undefined ? "remote_url" : sqlString(input.remoteUrl)},
      reason='authenticated remote evidence confirmed', updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(input.id)} AND status IN ('pending_reconciliation','reconciliation_required') AND remote_write_started_at IS NOT NULL
      ${clause ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${clause})` : ""} RETURNING id;`);
    if (confirmed.length) recordAutomationJobEvent(input.id, "confirmed", "confirmed", "", input.now);
    command("COMMIT;"); return confirmed.length ? getJob(input.id) : null;
  } catch (error) { command("ROLLBACK;"); throw error; }
}

export function recoverExpiredAutomationJobs(input: { now: number; baseDelaySeconds?: number; maxDelaySeconds?: number; random?: () => number }): number {
  const ownerClause = ownerSql("d.owner_user_id");
  command("BEGIN IMMEDIATE;");
  try {
    const expired = rows<{ id: number; draft_id: number; attempts: number; max_attempts: number; remote_write_started_at: number | null; approval_expires_at: number | null }>(`SELECT job.id,job.draft_id,job.attempts,job.max_attempts,job.remote_write_started_at,job.approval_expires_at
      FROM automation_jobs AS job INNER JOIN drafts AS d ON d.id=job.draft_id
      WHERE job.status='running' AND job.lease_until IS NOT NULL AND job.lease_until<=${sqlNumber(input.now)}
        ${ownerClause ? `AND ${ownerClause}` : ""} ORDER BY job.lease_until, job.id;`);
    for (const job of expired) {
      const ambiguous = job.remote_write_started_at !== null;
      const dead = !ambiguous && job.attempts >= job.max_attempts;
      const approvalExpired = !ambiguous && (job.approval_expires_at === null || job.approval_expires_at <= input.now);
      const status = ambiguous ? "reconciliation_required" : approvalExpired ? "expired" : dead ? "dead_letter" : "queued";
      const event = ambiguous ? "reconcile_started" : approvalExpired ? "expired" : dead ? "dead_lettered" : "retry_scheduled";
      const errorClass = ambiguous ? "unknown_remote_state" : approvalExpired ? "approval_expired" : "lease_expired";
      const nextAttemptAt = status === "queued" ? input.now + retryDelaySeconds(job.attempts, input) : 0;
      command(`UPDATE automation_jobs SET status=${sqlString(status)}, reason=${sqlString(errorClass)}, error_class=${sqlString(errorClass)},
        reconciliation_status=${ambiguous ? "'required'" : "reconciliation_status"}, next_attempt_at=${sqlNumber(nextAttemptAt)},
        dead_lettered_at=${dead ? sqlNumber(input.now) : "NULL"}, lease_token=NULL, lease_until=NULL, updated_at=${sqlNumber(input.now)}
        WHERE id=${sqlNumber(job.id)} AND status='running' AND lease_until<=${sqlNumber(input.now)};`);
      recordAutomationJobEvent(job.id, event, status, errorClass, input.now);
      if (approvalExpired) makeDraftReadyAfterExpiry(job.draft_id,input.now);
    }
    command("COMMIT;");
    return expired.length;
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function getDeadLetterAutomationJobs(limit = 100): AutomationJob[] {
  return rows<AutomationJobRow>(`${AUTOMATION_JOB_SELECT}
    WHERE automation_jobs.status='dead_letter' ${ownerSql("job_draft.owner_user_id") ? `AND ${ownerSql("job_draft.owner_user_id")}` : ""}
    ORDER BY automation_jobs.dead_lettered_at DESC, automation_jobs.id DESC LIMIT ${sqlNumber(Math.max(1, Math.min(500, limit)))};`).map(automationJob);
}

export function claimAutomationJob(id: number, now: number): AutomationJob | null {
  command("BEGIN IMMEDIATE;");
  try {
    const eligible = rows<{ id: number }>(`SELECT id FROM automation_jobs
      WHERE id=${sqlNumber(id)} AND status IN ('queued','failed') AND lease_token IS NULL AND attempts<max_attempts
        AND scheduled_at<=${sqlNumber(now)} AND next_attempt_at<=${sqlNumber(now)} ${ownerSql("owner_user_id") ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerSql("d.owner_user_id")})` : ""} LIMIT 1;`)[0];
    if (!eligible) {
      command("COMMIT;");
      return null;
    }
    command(`UPDATE automation_jobs SET status='running', attempts=attempts+1, updated_at=${sqlNumber(now)}
      WHERE id=${sqlNumber(id)} AND status IN ('queued','failed') AND lease_token IS NULL AND attempts<max_attempts
        AND scheduled_at<=${sqlNumber(now)} AND next_attempt_at<=${sqlNumber(now)} ${ownerSql("owner_user_id") ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerSql("d.owner_user_id")})` : ""};`);
    recordAutomationJobEvent(id, "reserved", "running", "", now);
    command("COMMIT;");
    return getJob(id);
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function updateJob(input: {
  id: number;
  status?: string;
  receipt?: string;
  reason?: string;
  remoteUrl?: string;
  reconciliationStatus?: string;
  attempts?: number;
  now: number;
}): AutomationJob | null {
  const current = getJob(input.id);
  if (!current) return null;
  if (current.leaseToken) return null;
  if (current.status === "cancelled" && input.status === "queued") {
    return createJob({ draftId: current.draftId, accountId: current.accountId, action: current.action, scheduledAt: current.scheduledAt, now: input.now });
  }
  exec(`UPDATE automation_jobs SET status=${sqlString(input.status ?? current.status)},
    receipt=${sqlString(input.receipt ?? current.receipt)}, reason=${sqlString(input.reason ?? current.reason)},
    remote_url=${sqlString(input.remoteUrl ?? current.remoteUrl)},
    reconciliation_status=${sqlString(input.reconciliationStatus ?? current.reconciliationStatus)},
    attempts=${sqlNumber(input.attempts ?? current.attempts)}, updated_at=${sqlNumber(input.now)}
    WHERE id=${sqlNumber(input.id)} ${ownerSql("owner_user_id") ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerSql("d.owner_user_id")})` : ""};`);
  if (input.status && input.status !== current.status) recordAutomationJobEvent(input.id, input.status, input.status, "", input.now);
  return getJob(input.id);
}

export function recoverStaleAutomationJob(input: { id: number; cutoff: number; status: string; reason: string; now: number }): boolean {
  const recovered = criticalRows<{ id: number }>(`UPDATE automation_jobs SET status=${sqlString(input.status)}, reason=${sqlString(input.reason)},
    reconciliation_status='required', updated_at=${sqlNumber(input.now)}
    WHERE id=${sqlNumber(input.id)} AND status='running' AND lease_token IS NULL AND updated_at<=${sqlNumber(input.cutoff)} ${ownerSql("owner_user_id") ? `AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=automation_jobs.draft_id AND ${ownerSql("d.owner_user_id")})` : ""} RETURNING id;`).length > 0;
  if (recovered) recordAutomationJobEvent(input.id, input.status, input.status, "stale_dispatch", input.now);
  return recovered;
}

function parseNumberArray(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(Number).filter((item) => Number.isInteger(item) && item > 0) : [];
  } catch {
    return [];
  }
}

function batchFromRow(row: {
  id: string;
  prompt: string;
  format: string;
  variant_mode: string;
  account_ids_json: string;
  provider: string;
  model: string;
  status: string;
  created_at: number;
  updated_at: number;
}): DraftBatch {
  return {
    id: row.id,
    prompt: row.prompt,
    format: row.format,
    variantMode: row.variant_mode === "same_text" ? "same_text" : "per_account",
    accountIds: parseNumberArray(row.account_ids_json),
    provider: row.provider,
    model: row.model,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraftBatch(input: {
  id?: string;
  prompt: string;
  format: string;
  variantMode: "per_account" | "same_text";
  accountIds: number[];
  provider: string;
  model: string;
  status?: string;
  now: number;
}): DraftBatch {
  const id = input.id || `batch_${randomUUID()}`;
  for (const accountId of input.accountIds) requireOwnedAccount(accountId);
  exec(`INSERT INTO draft_batches
    (id, prompt, format, variant_mode, account_ids_json, provider, model, status, owner_user_id, created_at, updated_at)
    VALUES (${sqlString(id)}, ${sqlString(input.prompt)}, ${sqlString(input.format)},
      ${sqlString(input.variantMode)}, ${sqlString(JSON.stringify(input.accountIds))},
      ${sqlString(input.provider)}, ${sqlString(input.model)}, ${sqlString(input.status || "draft")},
      ${currentOwnerId() === undefined ? "NULL" : sqlString(currentOwnerId()!)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
  const batch = getDraftBatch(id);
  if (!batch) throw new Error("draft batch could not be created");
  return batch;
}

export function getDraftBatch(id: string): DraftBatch | null {
  const row = rows<{
    id: string;
    prompt: string;
    format: string;
    variant_mode: string;
    account_ids_json: string;
    provider: string;
    model: string;
    status: string;
    created_at: number;
    updated_at: number;
  }>(`SELECT id, prompt, format, variant_mode, account_ids_json, provider, model, status,
      created_at, updated_at FROM draft_batches WHERE id=${sqlString(id)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""} LIMIT 1;`)[0];
  return row ? batchFromRow(row) : null;
}

export function updateDraftBatch(id: string, status: string, now: number): DraftBatch | null {
  if (!getDraftBatch(id)) return null;
  exec(`UPDATE draft_batches SET status=${sqlString(status)}, updated_at=${sqlNumber(now)} WHERE id=${sqlString(id)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""};`);
  return getDraftBatch(id);
}

export function getDraftsByBatch(id: string): DraftRecord[] {
  return getDrafts(500).filter((draft) => draft.batchId === id);
}

export function recordUsageEvent(input: {
  kind: string;
  provider: string;
  model: string;
  units?: number;
  estimatedUsd?: number;
  reportedUsd?: number;
  costBasis?: "reported" | "estimated" | "unknown";
  inputTokens?: number;
  outputTokens?: number;
  reservationId?: string;
  metadata?: Record<string, unknown>;
  now: number;
}): UsageEvent {
  exec(`INSERT INTO usage_events
    (kind, provider, model, units, estimated_usd, metadata_json, owner_user_id, created_at,
      estimated_cost_usd, reported_cost_usd, cost_basis, input_tokens, output_tokens, reservation_id)
    VALUES (${sqlString(input.kind)}, ${sqlString(input.provider)}, ${sqlString(input.model)},
      ${sqlNumber(input.units || 1)}, ${Number.isFinite(input.estimatedUsd) ? input.estimatedUsd : 0},
      ${sqlString(JSON.stringify(input.metadata || {}))}, ${currentOwnerId() === undefined ? "NULL" : sqlString(currentOwnerId()!)}, ${sqlNumber(input.now)},
      ${sqlReal(input.estimatedUsd)}, ${sqlReal(input.reportedUsd)}, ${sqlString(input.costBasis || (input.reportedUsd != null ? "reported" : input.estimatedUsd != null ? "estimated" : "unknown"))},
      ${input.inputTokens == null ? "NULL" : sqlNumber(input.inputTokens)}, ${input.outputTokens == null ? "NULL" : sqlNumber(input.outputTokens)}, ${input.reservationId ? sqlString(input.reservationId) : "NULL"});`);
  const row = rows<{
    id: number;
    kind: string;
    provider: string;
    model: string;
    units: number;
    estimated_usd: number;
    metadata_json: string;
    created_at: number;
  }>("SELECT id, kind, provider, model, units, estimated_usd, metadata_json, created_at FROM usage_events ORDER BY id DESC LIMIT 1;")[0];
  if (!row) throw new Error("usage event could not be recorded");
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    units: row.units,
    estimatedUsd: row.estimated_usd,
    metadata: parseObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

export function getUsageSummary(since = 0): {
  events: number;
  units: number;
  estimatedUsd: number;
  reportedUsd: number;
  unknownCostEvents: number;
  inputTokens: number;
  outputTokens: number;
  byProvider: Array<{ provider: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>;
  byModel: Array<{ provider: string; model: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>;
  byKind: Array<{ kind: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>;
} {
  const total = rows<{ events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number; inputTokens: number; outputTokens: number }>(`SELECT COUNT(*) as events,
      COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_cost_usd), 0) as estimatedUsd,
      COALESCE(SUM(reported_cost_usd), 0) as reportedUsd,
      COALESCE(SUM(CASE WHEN cost_basis='unknown' THEN 1 ELSE 0 END),0) as unknownCostEvents,
      COALESCE(SUM(input_tokens),0) as inputTokens, COALESCE(SUM(output_tokens),0) as outputTokens
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""};`)[0] || { events: 0, units: 0, estimatedUsd: 0 };
  return {
    events: total.events,
    units: total.units,
    estimatedUsd: total.estimatedUsd,
    reportedUsd: total.reportedUsd,
    unknownCostEvents: total.unknownCostEvents,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    byProvider: rows<{ provider: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>(`SELECT provider,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_cost_usd), 0) as estimatedUsd,
      COALESCE(SUM(reported_cost_usd),0) as reportedUsd, COALESCE(SUM(CASE WHEN cost_basis='unknown' THEN 1 ELSE 0 END),0) as unknownCostEvents
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""} GROUP BY provider ORDER BY units DESC;`),
    byModel: rows<{ provider: string; model: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>(`SELECT provider, model,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_cost_usd), 0) as estimatedUsd,
      COALESCE(SUM(reported_cost_usd),0) as reportedUsd, COALESCE(SUM(CASE WHEN cost_basis='unknown' THEN 1 ELSE 0 END),0) as unknownCostEvents
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""} GROUP BY provider, model ORDER BY units DESC;`),
    byKind: rows<{ kind: string; events: number; units: number; estimatedUsd: number; reportedUsd: number; unknownCostEvents: number }>(`SELECT kind,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_cost_usd), 0) as estimatedUsd,
      COALESCE(SUM(reported_cost_usd),0) as reportedUsd, COALESCE(SUM(CASE WHEN cost_basis='unknown' THEN 1 ELSE 0 END),0) as unknownCostEvents
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} ${ownerSql("owner_user_id") ? `AND ${ownerSql("owner_user_id")}` : ""} GROUP BY kind ORDER BY units DESC;`),
  };
}

export type AiBudgetReservation = { id: string; allowed: boolean; reason?: "budget_exceeded" | "unknown_cost" };

function aiBudgetOwnerFilter(): string {
  const ownerId = currentOwnerId();
  return ownerId === undefined ? "owner_user_id IS NULL" : `owner_user_id=${sqlString(ownerId)}`;
}

function readAiBudget(name: string): number {
  const value = Number(getSetting(name, "0"));
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("AI budget configuration is invalid");
  return value;
}

export function reserveAiBudget(input: { id: string; task: string; provider: string; model: string; reservedUsd: number | null; now: number }): AiBudgetReservation {
  if (!input.id || !Number.isFinite(input.now) || input.now < 0) throw new Error("AI budget reservation is invalid");
  if (input.reservedUsd !== null && (!Number.isFinite(input.reservedUsd) || input.reservedUsd < 0)) throw new Error("AI budget estimate is invalid");
  const ownerId = currentOwnerId();
  const ownerValue = ownerId === undefined ? "NULL" : sqlString(ownerId);
  const ownerFilter = aiBudgetOwnerFilter();
  const dailyBudget = readAiBudget("ai_daily_budget_usd");
  const monthlyBudget = readAiBudget("ai_monthly_budget_usd");
  const day = new Date(input.now * 1000);
  const dayStart = Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 1000);
  const monthStart = Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1) / 1000);
  const hasBudget = (Number.isFinite(dailyBudget) && dailyBudget > 0) || (Number.isFinite(monthlyBudget) && monthlyBudget > 0);
  command("BEGIN IMMEDIATE;");
  try {
    const existing = rows<{ id: string; status: string }>(`SELECT id,status FROM ai_budget_reservations WHERE id=${sqlString(input.id)} AND ${ownerFilter} LIMIT 1;`)[0];
    if (existing) {
      command("COMMIT;");
      return { id: existing.id, allowed: existing.status === "pending" || existing.status === "ambiguous" };
    }
    if (hasBudget && input.reservedUsd === null) {
      command("COMMIT;");
      return { id: input.id, allowed: false, reason: "unknown_cost" };
    }
    const reservationAmount = input.reservedUsd ?? 0;
    const spendSince = (since: number) => rows<{ amount: number }>(`SELECT
        COALESCE((SELECT SUM(COALESCE(reported_cost_usd,estimated_cost_usd,0)) FROM usage_events WHERE ${ownerFilter} AND created_at>=${sqlNumber(since)}),0)
        + COALESCE((SELECT SUM(reserved_usd) FROM ai_budget_reservations WHERE ${ownerFilter} AND created_at>=${sqlNumber(since)} AND status IN ('pending','ambiguous')),0) as amount;`)[0]?.amount || 0;
    if ((Number.isFinite(dailyBudget) && dailyBudget > 0 && spendSince(dayStart) + reservationAmount > dailyBudget)
      || (Number.isFinite(monthlyBudget) && monthlyBudget > 0 && spendSince(monthStart) + reservationAmount > monthlyBudget)) {
      command("COMMIT;");
      return { id: input.id, allowed: false, reason: "budget_exceeded" };
    }
    command(`INSERT INTO ai_budget_reservations(id,owner_user_id,task,provider,model,reserved_usd,status,created_at)
      VALUES(${sqlString(input.id)},${ownerValue},${sqlString(input.task)},${sqlString(input.provider)},${sqlString(input.model)},${sqlReal(input.reservedUsd)},'pending',${sqlNumber(input.now)});`);
    command("COMMIT;");
    return { id: input.id, allowed: true };
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function settleAiBudgetReservation(id: string, input: {
  outcome: "success" | "known_failure" | "ambiguous";
  now: number;
  kind?: string;
  units?: number;
  estimatedUsd?: number | null;
  reportedUsd?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: Record<string, unknown>;
}): void {
  const ownerFilter = aiBudgetOwnerFilter();
  const status = input.outcome === "success" ? "settled" : input.outcome === "known_failure" ? "released" : "ambiguous";
  command("BEGIN IMMEDIATE;");
  try {
    const reservation = rows<{ id: string; task: string; provider: string; model: string; status: string; created_at: number }>(`SELECT id,task,provider,model,status,created_at FROM ai_budget_reservations WHERE id=${sqlString(id)} AND ${ownerFilter} LIMIT 1;`)[0];
    if (!reservation || reservation.status !== "pending") { command("COMMIT;"); return; }
    command(`UPDATE ai_budget_reservations SET status=${sqlString(status)},settled_at=${sqlNumber(input.now)} WHERE id=${sqlString(id)} AND ${ownerFilter} AND status='pending';`);
    if (input.outcome === "success") {
      recordUsageEvent({
        kind: input.kind || reservation.task,
        provider: reservation.provider,
        model: reservation.model,
        units: input.units,
        estimatedUsd: input.estimatedUsd ?? undefined,
        reportedUsd: input.reportedUsd ?? undefined,
        costBasis: input.reportedUsd != null ? "reported" : input.estimatedUsd != null ? "estimated" : "unknown",
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        reservationId: id,
        metadata: input.metadata,
        now: reservation.created_at,
      });
    }
    command("COMMIT;");
  } catch (error) { command("ROLLBACK;"); throw error; }
}

export function getAiBudgetStatus(now = Math.floor(Date.now() / 1000)): {
  dailyBudgetUsd: number; monthlyBudgetUsd: number; dailyCommittedUsd: number; monthlyCommittedUsd: number; pendingReservations: number;
} {
  const ownerFilter = aiBudgetOwnerFilter();
  const date = new Date(now * 1000);
  const dayStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
  const monthStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
  const committed = (since: number) => rows<{ amount: number }>(`SELECT
      COALESCE((SELECT SUM(COALESCE(reported_cost_usd,estimated_cost_usd,0)) FROM usage_events WHERE ${ownerFilter} AND created_at>=${sqlNumber(since)}),0)
      + COALESCE((SELECT SUM(reserved_usd) FROM ai_budget_reservations WHERE ${ownerFilter} AND created_at>=${sqlNumber(since)} AND status IN ('pending','ambiguous')),0) as amount;`)[0]?.amount || 0;
  return {
    dailyBudgetUsd: readAiBudget("ai_daily_budget_usd"),
    monthlyBudgetUsd: readAiBudget("ai_monthly_budget_usd"),
    dailyCommittedUsd: committed(dayStart),
    monthlyCommittedUsd: committed(monthStart),
    pendingReservations: rows<{ count: number }>(`SELECT COUNT(*) as count FROM ai_budget_reservations WHERE ${ownerFilter} AND status IN ('pending','ambiguous');`)[0]?.count || 0,
  };
}

export function getSecretCiphertext(name: string): { provider: string; ciphertext: string; updatedAt: number } | null {
  const scopedName = currentOwnerId() === undefined ? name : `owner:${encodeURIComponent(currentOwnerId()!)}:${name}`;
  const secret = rows<{ provider: string; ciphertext: string; updated_at: number }>(
    `SELECT provider, ciphertext, updated_at FROM secrets WHERE name=${sqlString(scopedName)} LIMIT 1;`,
  )[0];
  return secret ? { provider: secret.provider, ciphertext: secret.ciphertext, updatedAt: secret.updated_at } : null;
}

export function saveSecretCiphertext(name: string, provider: string, ciphertext: string, now: number): void {
  const scopedName = currentOwnerId() === undefined ? name : `owner:${encodeURIComponent(currentOwnerId()!)}:${name}`;
  exec(`INSERT INTO secrets (name, provider, ciphertext, updated_at)
    VALUES (${sqlString(scopedName)}, ${sqlString(provider)}, ${sqlString(ciphertext)}, ${sqlNumber(now)})
    ON CONFLICT(name) DO UPDATE SET provider=excluded.provider, ciphertext=excluded.ciphertext, updated_at=excluded.updated_at;`);
}

export function deleteSecret(name: string): void {
  const scopedName = currentOwnerId() === undefined ? name : `owner:${encodeURIComponent(currentOwnerId()!)}:${name}`;
  exec(`DELETE FROM secrets WHERE name=${sqlString(scopedName)};`);
}

export function getSecretMetas(mask: (name: string) => string): SecretMeta[] {
  const ownerId = currentOwnerId();
  const prefix = ownerId === undefined ? "" : `owner:${encodeURIComponent(ownerId)}:`;
  const all = rows<{ name: string; provider: string; updated_at: number }>(
    `SELECT name, provider, updated_at FROM secrets ${ownerId === undefined ? "" : `WHERE name LIKE ${sqlString(prefix.replaceAll("%", "\\%").replaceAll("_", "\\_") + "%")} ESCAPE '\\'`} ORDER BY name;`,
  );
  return all.map((secret) => ({
    name: prefix ? secret.name.slice(prefix.length) : secret.name,
    provider: secret.provider,
    configured: true,
    masked: mask(secret.name),
    updatedAt: secret.updated_at,
  }));
}

/**
 * Single-writer guard for the automation loop (worker vs. the Next in-process
 * scheduler). Both claim the same app_settings row; a claim succeeds when the row
 * is empty, expired, or already owned by this exact owner+pid. The lock is a
 * heartbeat, not a mutex: it is refreshed on every tick and forgotten after
 * AUTOMATION_LOCK_TTL_SECONDS, so a killed process never blocks the next start.
 */
export const AUTOMATION_LOCK_SETTING = "automation_lock";
export const AUTOMATION_LOCK_TTL_SECONDS = 120;

export type AutomationLock = { owner: string; pid: number; host: string; at: number };

export function readAutomationLock(now = Math.floor(Date.now() / 1000)): AutomationLock | null {
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(getSetting(AUTOMATION_LOCK_SETTING, "") || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const { owner, pid, host, at } = parsed;
  if (typeof owner !== "string" || !owner || !Number.isSafeInteger(pid) || Number(pid) < 1
    || typeof host !== "string" || !host || !Number.isSafeInteger(at) || Number(at) > now
    || now - Number(at) > AUTOMATION_LOCK_TTL_SECONDS) return null;
  return { owner, pid: Number(pid), host, at: Number(at) };
}

export function claimAutomationLock(
  owner: string,
  now = Math.floor(Date.now() / 1000),
  pid = process.pid,
  host = process.env.HOSTNAME || hostname(),
): { ok: boolean; holder: AutomationLock | null } {
  command("BEGIN IMMEDIATE;");
  try {
    const holder = readAutomationLock(now);
    if (holder && !(holder.owner === owner && holder.pid === pid && holder.host === host)) {
      command("COMMIT;");
      return { ok: false, holder };
    }
    setSetting(AUTOMATION_LOCK_SETTING, JSON.stringify({ owner, pid, host, at: now }), now);
    command("COMMIT;");
    return { ok: true, holder: { owner, pid, host, at: now } };
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function releaseAutomationLock(owner: string, pid = process.pid, now = Math.floor(Date.now() / 1000), host = process.env.HOSTNAME || hostname()): void {
  const holder = readAutomationLock(now);
  if (holder && holder.owner === owner && holder.pid === pid && holder.host === host) setSetting(AUTOMATION_LOCK_SETTING, "", now);
}

export function getSetting(name: string, fallback = ""): string {
  const ownerId = currentOwnerId();
  const scoped = ownerId !== undefined && (name.startsWith("ai_") || name.startsWith("jev_") || name === "writing_style_settings");
  const key = scoped ? `owner:${encodeURIComponent(ownerId!)}:${name}` : name;
  return rows<{ value: string }>(`SELECT value FROM app_settings WHERE name=${sqlString(key)} LIMIT 1;`)[0]?.value || fallback;
}

export function setSetting(name: string, value: string, now: number): void {
  const ownerId = currentOwnerId();
  const scoped = ownerId !== undefined && (name.startsWith("ai_") || name.startsWith("jev_") || name === "writing_style_settings");
  const key = scoped ? `owner:${encodeURIComponent(ownerId!)}:${name}` : name;
  exec(`INSERT INTO app_settings (name, value, updated_at)
    VALUES (${sqlString(key)}, ${sqlString(value)}, ${sqlNumber(now)})
    ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`);
}

function isWritingSkillId(value: unknown): value is WritingSkill["id"] {
  return value === "newsroom-style" || value === "humanize-writing";
}

export function writingSkillIds(value: unknown): WritingSkill["id"][] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter(isWritingSkillId))];
  return ids.length === value.length ? ids : null;
}

export function getWritingStyleSettings(): WritingStyleSettings {
  let parsed: unknown;
  try { parsed = JSON.parse(getSetting("writing_style_settings", "")); } catch { parsed = null; }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const storedSkills = Array.isArray(record.skills) ? record.skills : [];
  const skills = DEFAULT_WRITING_SKILLS.map((defaults) => {
    const stored = storedSkills.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === defaults.id) as Record<string, unknown> | undefined;
    return {
      ...defaults,
      enabled: stored?.enabled !== false,
      instructions: typeof stored?.instructions === "string" && stored.instructions.trim() ? stored.instructions.trim().slice(0, 6000) : defaults.instructions,
    };
  });
  const storedExampleStyle = record.exampleStyle && typeof record.exampleStyle === "object" && !Array.isArray(record.exampleStyle) ? record.exampleStyle as Record<string, unknown> : {};
  const exampleStyle = {
    ...DEFAULT_ACCOUNT_STYLE,
    ...storedExampleStyle,
    editorialInstruction: readEditorialInstruction(storedExampleStyle.editorialInstruction, DEFAULT_EDITORIAL_INSTRUCTION),
    writingSkillIds: writingSkillIds(storedExampleStyle.writingSkillIds) || skills.filter((skill) => skill.enabled).map((skill) => skill.id),
    attribution: "özel haber etiketi varsa görünür kaynak adı; aksi halde otomatik atıf yok",
  };
  return { exampleStyle, skills };
}

export function saveWritingStyleSettings(input: WritingStyleSettings, now: number): WritingStyleSettings {
  const existing = getWritingStyleSettings();
  const requested = new Map((input.skills || []).filter((item) => isWritingSkillId(item?.id)).map((item) => [item.id, item]));
  const skills = existing.skills.map((skill) => {
    const value = requested.get(skill.id);
    const instructions = typeof value?.instructions === "string" ? value.instructions.trim() : skill.instructions;
    if (!instructions || instructions.length > 6000) throw new Error(`${skill.name} için 1-6000 karakter arası yönerge gerekli`);
    return { ...skill, enabled: value?.enabled !== false, instructions };
  });
  const exampleStyle = input.exampleStyle && typeof input.exampleStyle === "object" && !Array.isArray(input.exampleStyle)
    ? { ...DEFAULT_ACCOUNT_STYLE, ...input.exampleStyle, editorialInstruction: writeEditorialInstruction(input.exampleStyle.editorialInstruction, DEFAULT_EDITORIAL_INSTRUCTION), writingSkillIds: writingSkillIds(input.exampleStyle.writingSkillIds) || [], attribution: "özel haber etiketi varsa görünür kaynak adı; aksi halde otomatik atıf yok" }
    : existing.exampleStyle;
  const value = { exampleStyle, skills };
  setSetting("writing_style_settings", JSON.stringify(value), now);
  return value;
}

const AUTOMATION_DEFAULTS: Array<{ id: AutomationTaskId; intervalSeconds: number }> = [
  { id: "monitor_engine", intervalSeconds: 15 },
  { id: "source_scan", intervalSeconds: 300 },
  { id: "source_liveness", intervalSeconds: 86400 },
  { id: "queue_worker", intervalSeconds: 300 },
  { id: "reconciliation", intervalSeconds: 300 },
  { id: "account_inference", intervalSeconds: 300 },
];

function validAutomationTask(value: unknown): value is AutomationTaskSchedule {
  return Boolean(value && typeof value === "object" && AUTOMATION_TASK_IDS.includes((value as AutomationTaskSchedule).id) && Number.isFinite((value as AutomationTaskSchedule).nextRunAt));
}

export function getAutomationSchedules(now = Math.floor(Date.now() / 1000)): AutomationTaskSchedule[] {
  let parsed: unknown;
  try { parsed = JSON.parse(getSetting("automation_schedules", "")); } catch { parsed = null; }
  const stored = Array.isArray(parsed) ? parsed.filter(validAutomationTask) : [];
  const result = AUTOMATION_DEFAULTS.map((defaults) => {
    const current = stored.find((item) => item.id === defaults.id);
    const legacyLast = defaults.id === "source_liveness" ? Number(getSetting("source_liveness_last_run", "0")) || 0 : 0;
    return current || { id: defaults.id, enabled: true, intervalSeconds: defaults.intervalSeconds, nextRunAt: now + defaults.intervalSeconds, lastRunAt: legacyLast, lastStatus: (legacyLast ? "success" : "never") as AutomationTaskStatus, updatedAt: now };
  });
  if (stored.length !== result.length || result.some((item) => !stored.some((saved) => saved.id === item.id))) setSetting("automation_schedules", JSON.stringify(result), now);
  return result;
}

export function saveAutomationSchedule(input: { id: AutomationTaskId; enabled: boolean; intervalSeconds: number; nextRunAt: number; now: number }): AutomationTaskSchedule {
  if (!AUTOMATION_TASK_IDS.includes(input.id)) throw new Error("bilinmeyen otomasyon görevi");
  const minimum = input.id === "monitor_engine" ? 15 : 60;
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < minimum || input.intervalSeconds > 30 * 86400) throw new Error(`periyot ${minimum} saniye ile 30 gün arasında olmalı`);
  if (!Number.isInteger(input.nextRunAt) || input.nextRunAt <= 0) throw new Error("geçerli sonraki çalışma tarihi gerekli");
  const schedules = getAutomationSchedules(input.now).map((item) => item.id === input.id ? { ...item, enabled: input.enabled, intervalSeconds: input.intervalSeconds, nextRunAt: input.nextRunAt, updatedAt: input.now } : item);
  setSetting("automation_schedules", JSON.stringify(schedules), input.now);
  return schedules.find((item) => item.id === input.id)!;
}

export function updateAutomationTaskRun(id: AutomationTaskId, status: AutomationTaskStatus, finishedAt: number): void {
  const schedules = getAutomationSchedules(finishedAt).map((item) => item.id === id ? { ...item, lastRunAt: finishedAt, lastStatus: status, nextRunAt: finishedAt + item.intervalSeconds, updatedAt: finishedAt } : item);
  setSetting("automation_schedules", JSON.stringify(schedules), finishedAt);
  if (id === "source_liveness" && status === "success") setSetting("source_liveness_last_run", String(finishedAt), finishedAt);
}

export function recordAutomationLog(input: { taskId: AutomationTaskId; status: AutomationTaskStatus; startedAt: number; finishedAt?: number | null; message?: string; details?: Record<string, unknown> }): AutomationLog {
  const redact = (value: string) => value
    .replace(/("(?:auth_token|ct0|api[_ -]?key|password|cookie)"\s*:\s*")[^"]*(")/giu, "$1[redacted]$2")
    .replace(/(auth_token|ct0|api[_ -]?key|password|cookie)(\s*[:=]\s*)[^\s;",}]+/giu, "$1$2[redacted]");
  const message = redact(input.message || "").slice(0, 2000);
  const details = JSON.parse(redact(JSON.stringify(input.details || {}))) as Record<string, unknown>;
  exec(`INSERT INTO automation_logs (task_id, status, started_at, finished_at, message, details_json)
    VALUES (${sqlString(input.taskId)}, ${sqlString(input.status)}, ${sqlNumber(input.startedAt)}, ${input.finishedAt ? sqlNumber(input.finishedAt) : "NULL"}, ${sqlString(message)}, ${sqlString(JSON.stringify(details))});
    DELETE FROM automation_logs WHERE id <= COALESCE((SELECT id FROM automation_logs ORDER BY id DESC LIMIT 1 OFFSET 199), 0);`);
  return getAutomationLogs(1)[0];
}

export function getAutomationLogs(limit = 100): AutomationLog[] {
  return rows<{ id: number; task_id: string; status: string; started_at: number; finished_at: number | null; message: string; details_json: string }>(`SELECT id, task_id, status, started_at, finished_at, message, details_json FROM automation_logs ORDER BY id DESC LIMIT ${sqlNumber(Math.max(1, Math.min(200, limit)))};`).map((item) => ({ id: item.id, taskId: item.task_id as AutomationTaskId, status: item.status as AutomationTaskStatus, startedAt: item.started_at, finishedAt: item.finished_at, message: item.message, details: parseObject(item.details_json) }));
}

export function getAnalytics(input: { accountId?: number; rangeDays?: 7 | 14 } = {}) {
  requireValidOptionalAccount(input.accountId);
  const accountIds = input.accountId ? [input.accountId] : getAccounts().map((account) => account.id);
  const accountIdSql = accountIds.length ? accountIds.map(sqlNumber).join(",") : "-1";
  const result = rows<{ drafts: number; queued: number; confirmed: number; blocked: number; failed: number; feedback: number }>(`SELECT
    (SELECT COUNT(*) FROM drafts WHERE ${ownerSql("owner_user_id") || "1=1"}) as drafts,
    (SELECT COUNT(*) FROM automation_jobs j INNER JOIN drafts d ON d.id=j.draft_id WHERE ${ownerSql("d.owner_user_id") || "1=1"} AND j.status IN ('queued','running','submitted','pending_reconciliation')) as queued,
    (SELECT COUNT(*) FROM automation_jobs j INNER JOIN drafts d ON d.id=j.draft_id WHERE ${ownerSql("d.owner_user_id") || "1=1"} AND j.status='confirmed') as confirmed,
    (SELECT COUNT(*) FROM automation_jobs j INNER JOIN drafts d ON d.id=j.draft_id WHERE ${ownerSql("d.owner_user_id") || "1=1"} AND j.status='blocked') as blocked,
    (SELECT COUNT(*) FROM automation_jobs j INNER JOIN drafts d ON d.id=j.draft_id WHERE ${ownerSql("d.owner_user_id") || "1=1"} AND j.status='failed') as failed,
    (SELECT COUNT(*) FROM feedback_snapshots f WHERE EXISTS (SELECT 1 FROM publish_attempts p WHERE p.post_external_id=f.post_external_id AND p.account_id IN (${accountIdSql}))) as feedback;`)[0];
  const now = new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const rangeDays = input.rangeDays === 7 ? 7 : 14;
  const rangeStart = nowSeconds - rangeDays * 86400;
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const aiUsage = {
    ...getUsageSummary(monthStart),
    monthlyBudgetUsd: Number(getSetting("ai_monthly_budget_usd", "0")) || 0,
  };
  const accountRows = rows<{ account_id: number; handle: string; confirmed: number; feedback: number; likes: number; replies: number; reposts: number; quotes: number; views: number; poll_votes: number }>(`
    WITH confirmed AS (
      SELECT DISTINCT account_id, post_external_id FROM publish_attempts
      WHERE status='confirmed' AND account_id IS NOT NULL AND post_external_id<>'' AND account_id IN (${accountIdSql})
    ), latest_feedback AS (
      SELECT feedback.* FROM feedback_snapshots AS feedback
      INNER JOIN (
        SELECT post_external_id, MAX(captured_at) AS captured_at
        FROM feedback_snapshots GROUP BY post_external_id
      ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    )
    SELECT attempt.account_id, accounts.handle, COUNT(DISTINCT attempt.post_external_id) as confirmed,
      COUNT(feedback.id) as feedback, COALESCE(SUM(feedback.likes), 0) as likes,
      COALESCE(SUM(feedback.replies), 0) as replies, COALESCE(SUM(feedback.reposts), 0) as reposts,
      COALESCE(SUM(feedback.quotes), 0) as quotes, COALESCE(SUM(feedback.views), 0) as views, COALESCE(SUM(feedback.poll_votes), 0) as poll_votes
    FROM confirmed AS attempt
    INNER JOIN accounts ON accounts.id=attempt.account_id
    LEFT JOIN latest_feedback AS feedback ON feedback.post_external_id=attempt.post_external_id
    GROUP BY attempt.account_id, accounts.handle ORDER BY confirmed DESC, feedback DESC;
  `);
  const accountRowById = new Map(accountRows.map((account) => [account.account_id, account]));
  const accountPerformance = getAccounts().map((configured) => {
    const account = accountRowById.get(configured.id) || {
      account_id: configured.id,
      handle: configured.handle,
      confirmed: 0,
      feedback: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
      quotes: 0,
      views: 0,
      poll_votes: 0,
    };
    const profile = rows<{ followers: number; following: number; statuses: number; likes: number; media_count: number; verification_status: BlueCheckStatus; captured_at: number }>(`SELECT followers, following, statuses, likes, media_count, verification_status, captured_at
      FROM account_metric_snapshots WHERE account_id=${sqlNumber(account.account_id)} ORDER BY captured_at DESC LIMIT 1;`)[0];
    const followerAt = (seconds: number): number | null => rows<{ followers: number }>(`SELECT followers FROM account_metric_snapshots
      WHERE account_id=${sqlNumber(account.account_id)} AND captured_at <= ${sqlNumber(Math.floor(Date.now() / 1000) - seconds)} ORDER BY captured_at DESC LIMIT 1;`)[0]?.followers ?? null;
    const metrics = metricBreakdown(account);
    const subscriptionEvidence = accountSubscriptionEvidence(account.account_id, nowSeconds);
    return {
      accountId: account.account_id,
      handle: account.handle,
      confirmed: account.confirmed,
      feedback: account.feedback,
      performance: historicalPerformanceScore(account.feedback ? [account] : []),
      followers: profile?.followers || 0,
      followerDelta24h: profile && followerAt(86400) !== null ? profile.followers - Number(followerAt(86400)) : null,
      followerDelta7d: profile && followerAt(7 * 86400) !== null ? profile.followers - Number(followerAt(7 * 86400)) : null,
      following: profile?.following || 0,
      statuses: profile?.statuses || 0,
      profileLikes: profile?.likes || 0,
      mediaCount: profile?.media_count || 0,
      blueCheckStatus: profile?.verification_status || "unknown" as BlueCheckStatus,
      subscriptionTier: subscriptionEvidence.currentTier,
      subscriptionEvidence,
      metrics,
    };
  });
  const ownPosts = rows<{ external_id: string; handle: string; text: string; format: string; score_reason: string; captured_at: number; likes: number; replies: number; reposts: number; quotes: number; views: number; poll_votes: number; created_at: number }>(`
    WITH latest_feedback AS (
      SELECT feedback.* FROM feedback_snapshots AS feedback INNER JOIN (
        SELECT post_external_id, MAX(captured_at) AS captured_at FROM feedback_snapshots GROUP BY post_external_id
      ) AS latest ON latest.post_external_id=feedback.post_external_id AND latest.captured_at=feedback.captured_at
    )
    SELECT attempt.post_external_id as external_id, accounts.handle, observed_posts.draft_text as text,
      COALESCE((SELECT format FROM drafts WHERE drafts.external_id=attempt.post_external_id AND drafts.account_id=attempt.account_id ORDER BY updated_at DESC LIMIT 1), 'post') as format, observed_posts.score_reason,
      feedback.captured_at, feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views, feedback.poll_votes, attempt.created_at
    FROM publish_attempts AS attempt
    INNER JOIN accounts ON accounts.id=attempt.account_id
    LEFT JOIN observed_posts ON observed_posts.external_id=attempt.post_external_id
    INNER JOIN latest_feedback AS feedback ON feedback.post_external_id=attempt.post_external_id
    WHERE attempt.status='confirmed' AND attempt.account_id IN (${accountIdSql}) ORDER BY feedback.views DESC, feedback.captured_at DESC LIMIT 100;
  `);
  const ownMetrics = ownPosts.map((post) => ({ ...post, metrics: metricBreakdown(post), category: scoreEvidenceFor(post.score_reason, 0).categories[0] || "belirtilmemiş" }));
  const baseline = ownMetrics.length ? ownMetrics.reduce((sum, post) => sum + post.metrics.engagementRate, 0) / ownMetrics.length : 0;
  const groupPerformance = (key: (post: typeof ownMetrics[number]) => string) => {
    const grouped = new Map<string, typeof ownMetrics>();
    for (const post of ownMetrics) {
      const value = key(post);
      grouped.set(value, [...(grouped.get(value) || []), post]);
    }
    return [...grouped.entries()].map(([label, posts]) => {
      const engagementRate = posts.reduce((sum, post) => sum + post.metrics.engagementRate, 0) / posts.length;
      return { label, posts: posts.length, engagementRate, views: posts.reduce((sum, post) => sum + post.metrics.views, 0), status: posts.length < 5 ? "insufficient" as const : engagementRate >= baseline ? "above" as const : "below" as const };
    }).sort((a, b) => b.engagementRate - a.engagementRate);
  };
  const categoryPerformance = groupPerformance((post) => post.category).map(({ label, ...item }) => ({ category: label, ...item }));
  const formatPerformance = groupPerformance((post) => post.format || "post").map(({ label, ...item }) => ({ format: label, ...item }));
  const timePerformance = groupPerformance((post) => `${String(Math.floor(new Date(post.created_at * 1000).getHours() / 3) * 3).padStart(2, "0")}:00–${String(Math.floor(new Date(post.created_at * 1000).getHours() / 3) * 3 + 2).padStart(2, "0")}:59`)
    .map((item) => ({ label: item.label, posts: item.posts, engagementRate: item.engagementRate, status: item.status }));
  const competitors = getCompetitors().map((competitor) => {
    const profile = rows<{ followers: number }>(`SELECT followers FROM competitor_profile_snapshots WHERE competitor_id=${sqlNumber(competitor.id)} ORDER BY captured_at DESC LIMIT 1;`)[0];
    const followerAt = (seconds: number): number | null => rows<{ followers: number }>(`SELECT followers FROM competitor_profile_snapshots
      WHERE competitor_id=${sqlNumber(competitor.id)} AND captured_at <= ${sqlNumber(Math.floor(Date.now() / 1000) - seconds)} ORDER BY captured_at DESC LIMIT 1;`)[0]?.followers ?? null;
    const posts = rows<{ external_id: string; text: string; created_timestamp: number; likes: number; replies: number; reposts: number; quotes: number; views: number; poll_votes: number }>(`SELECT external_id, text, created_timestamp, likes, replies, reposts, quotes, views, poll_votes
      FROM competitor_posts WHERE competitor_id=${sqlNumber(competitor.id)} ORDER BY views DESC, created_timestamp DESC LIMIT 10;`);
    const metrics = posts.reduce((total, post) => mergeMetricBreakdowns(total, metricBreakdown(post)), emptyMetricBreakdown());
    return {
      ...competitor,
      followers: profile?.followers || 0,
      followerDelta24h: profile && followerAt(86400) !== null ? profile.followers - Number(followerAt(86400)) : null,
      followerDelta7d: profile && followerAt(7 * 86400) !== null ? profile.followers - Number(followerAt(7 * 86400)) : null,
      metrics,
      topPosts: posts.map((post) => ({ externalId: post.external_id, text: post.text, createdAt: post.created_timestamp, metrics: metricBreakdown(post) })),
    };
  });
  const selectedAccountId = input.accountId !== undefined && accountPerformance.some((account) => account.accountId === input.accountId) ? input.accountId : null;
  const detailRows = selectedAccountId === null ? [] : rows<{
    external_id: string; text: string; format: string; score_reason: string; media_count: number; created_at: number;
    milestone: string; captured_at: number; likes: number; replies: number; reposts: number; quotes: number; views: number; poll_votes: number;
  }>(`SELECT attempt.post_external_id AS external_id, COALESCE(observed_posts.draft_text, '') AS text,
      COALESCE((SELECT format FROM drafts WHERE drafts.external_id=attempt.post_external_id AND drafts.account_id=attempt.account_id ORDER BY updated_at DESC LIMIT 1), 'post') AS format,
      COALESCE(observed_posts.score_reason, '') AS score_reason, COALESCE(observed_posts.media_count, 0) AS media_count, attempt.created_at,
      feedback.milestone, feedback.captured_at, feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views, feedback.poll_votes
    FROM publish_attempts AS attempt
    INNER JOIN feedback_snapshots AS feedback ON feedback.post_external_id=attempt.post_external_id
    LEFT JOIN observed_posts ON observed_posts.external_id=attempt.post_external_id
    WHERE attempt.status='confirmed' AND attempt.account_id=${sqlNumber(selectedAccountId)}
      AND feedback.captured_at >= ${sqlNumber(rangeStart)}
    ORDER BY feedback.captured_at DESC;`);
  type DetailSnapshot = { milestone: string; capturedAt: number; metrics: ReturnType<typeof metricBreakdown> };
  type DetailPost = { externalId: string; text: string; format: string; category: string; mediaCount: number; createdAt: number; latest: DetailSnapshot; snapshots: Record<string, DetailSnapshot> };
  const detailByPost = new Map<string, DetailPost>();
  for (const row of detailRows) {
    const snapshot: DetailSnapshot = { milestone: row.milestone, capturedAt: row.captured_at, metrics: metricBreakdown(row) };
    const current = detailByPost.get(row.external_id);
    if (!current) {
      detailByPost.set(row.external_id, {
        externalId: row.external_id, text: row.text, format: row.format || "post", category: scoreEvidenceFor(row.score_reason, 0).categories[0] || "belirtilmemiş",
        mediaCount: row.media_count, createdAt: row.created_at, latest: snapshot, snapshots: { [row.milestone]: snapshot },
      });
      continue;
    }
    if (snapshot.capturedAt > current.latest.capturedAt) current.latest = snapshot;
    if (!current.snapshots[row.milestone] || snapshot.capturedAt > current.snapshots[row.milestone].capturedAt) current.snapshots[row.milestone] = snapshot;
  }
  const detailPosts = [...detailByPost.values()].sort((left, right) => right.latest.capturedAt - left.latest.capturedAt);
  const detailBaseline = detailPosts.length ? detailPosts.reduce((sum, post) => sum + post.latest.metrics.engagementRate, 0) / detailPosts.length : 0;
  const detailBreakdown = (key: (post: DetailPost) => string) => {
    const grouped = new Map<string, DetailPost[]>();
    for (const post of detailPosts) grouped.set(key(post), [...(grouped.get(key(post)) || []), post]);
    return [...grouped.entries()].map(([label, posts]) => {
      const engagementRate = posts.reduce((sum, post) => sum + post.latest.metrics.engagementRate, 0) / posts.length;
      return { label, posts: posts.length, views: posts.reduce((sum, post) => sum + post.latest.metrics.views, 0), engagementRate, status: posts.length < 5 ? "insufficient" as const : engagementRate >= detailBaseline ? "above" as const : "below" as const };
    }).sort((left, right) => right.engagementRate - left.engagementRate);
  };
  const timeline = new Map<string, { label: string; views: number; engagements: number; posts: number }>();
  for (const post of detailPosts) {
    const key = new Date(post.latest.capturedAt * 1000).toISOString().slice(0, 10);
    const point = timeline.get(key) || { label: key, views: 0, engagements: 0, posts: 0 };
    point.views += post.latest.metrics.views;
    point.engagements += post.latest.metrics.engagements;
    point.posts += 1;
    timeline.set(key, point);
  }
  const lifecycle = FEEDBACK_MILESTONES.map(([milestone]) => {
    const snapshots = detailPosts.map((post) => post.snapshots[milestone]).filter((snapshot): snapshot is DetailSnapshot => Boolean(snapshot));
    const metrics = snapshots.reduce((total, snapshot) => mergeMetricBreakdowns(total, snapshot.metrics), emptyMetricBreakdown());
    return { milestone, samples: snapshots.length, metrics };
  });
  const barometerSamples = {
    publisher: rows<{ status: BlueCheckStatus; followers: number | null; likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
      SELECT feedback.publisher_verification_status AS status,
        (SELECT followers FROM account_metric_snapshots profile WHERE profile.account_id=attempt.account_id AND profile.captured_at <= feedback.captured_at ORDER BY profile.captured_at DESC LIMIT 1) AS followers,
        feedback.likes, feedback.replies, feedback.reposts, feedback.quotes, feedback.views
      FROM feedback_snapshots feedback INNER JOIN publish_attempts attempt ON attempt.post_external_id=feedback.post_external_id
      WHERE attempt.status='confirmed' AND feedback.milestone='60dk';`),
    source: rows<{ status: BlueCheckStatus; followers: number | null; likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
      SELECT post.author_verification_status AS status, snapshot.followers, snapshot.likes, snapshot.replies, snapshot.reposts, snapshot.quotes, snapshot.views
      FROM observed_posts post INNER JOIN post_metric_snapshots snapshot ON snapshot.post_external_id=post.external_id
      WHERE snapshot.metric_quality='ok' AND snapshot.captured_at BETWEEN post.first_seen_at + 3480 AND post.first_seen_at + 3900;`),
    competitor: rows<{ status: BlueCheckStatus; followers: number | null; likes: number; replies: number; reposts: number; quotes: number; views: number }>(`
      SELECT post.author_verification_status AS status,
        (SELECT followers FROM competitor_profile_snapshots profile WHERE profile.competitor_id=post.competitor_id AND profile.captured_at <= snapshot.captured_at ORDER BY profile.captured_at DESC LIMIT 1) AS followers,
        snapshot.likes, snapshot.replies, snapshot.reposts, snapshot.quotes, snapshot.views
      FROM competitor_posts post INNER JOIN competitor_post_snapshots snapshot ON snapshot.external_id=post.external_id
      WHERE snapshot.milestone='60dk';`),
  };
  const verificationBarometer = Object.entries(barometerSamples).map(([role, samples]) => {
    const rowsByStatus = BLUE_CHECK_STATUSES.map((status) => {
      const cohort = samples.filter((sample) => sample.status === status);
      const rates = cohort.map((sample) => metricBreakdown(sample).engagementRate);
      const perThousand = cohort.filter((sample) => Number(sample.followers) > 0).map((sample) => metricBreakdown(sample).engagements / Number(sample.followers) * 1000);
      return { status, samples: cohort.length, coverage: cohort.length ? perThousand.length / cohort.length : 0, engagementRate: median(rates), engagementPerThousand: median(perThousand) };
    });
    const blue = rowsByStatus.find((row) => row.status === "blue")!;
    const unverified = rowsByStatus.find((row) => row.status === "not_verified")!;
    const delta = blue.engagementPerThousand !== null && unverified.engagementPerThousand !== null ? blue.engagementPerThousand - unverified.engagementPerThousand : null;
    return { role, rows: rowsByStatus, deltaPerThousand: delta, maturity: blue.samples >= 30 && unverified.samples >= 30 ? "observational" as const : "insufficient" as const };
  });
  const selectedAccount = accountPerformance.find((account) => account.accountId === selectedAccountId) || null;
  const accountDetail = selectedAccount ? {
    account: selectedAccount,
    rangeDays,
    posts: detailPosts.map((post) => ({ ...post, snapshots: FEEDBACK_MILESTONES.map(([milestone]) => post.snapshots[milestone] || null) })),
    timeline: [...timeline.values()].sort((left, right) => left.label.localeCompare(right.label)),
    lifecycle,
    categoryPerformance: detailBreakdown((post) => post.category),
    formatPerformance: detailBreakdown((post) => post.format),
    mediaPerformance: detailBreakdown((post) => post.mediaCount > 0 ? "medyalı" : "metin"),
    timePerformance: detailBreakdown((post) => `${String(Math.floor(new Date(post.createdAt * 1000).getHours() / 3) * 3).padStart(2, "0")}:00–${String(Math.floor(new Date(post.createdAt * 1000).getHours() / 3) * 3 + 2).padStart(2, "0")}:59`),
    dataCoverage: detailPosts.length ? detailPosts.filter((post) => Boolean(post.snapshots["60dk"]) && Boolean(post.snapshots["24s"])).length / detailPosts.length : 0,
  } : null;
  const algorithmReference = {
    commit: "d0cef2f943084ee0d4310378031c9c2c37d67f12",
    actions: [
      { action: "Favorite / like", weight: 0.5, observed: true }, { action: "Reply", weight: 5, observed: true },
      { action: "Repost", weight: 1, observed: true }, { action: "Quote", weight: 5, observed: true },
      { action: "Share", weight: 2, observed: false }, { action: "Copy link", weight: 20, observed: false },
      { action: "Follow author", weight: 4, observed: false }, { action: "Negative feedback", weight: -43.2, observed: false },
    ],
    unavailable: ["For You / Following impression ayrımı", "link ve profil tıklaması", "share / copy-link", "dwell", "mute, block, report ve not interested"],
  };
  return {
    ...(result || { drafts: 0, queued: 0, confirmed: 0, blocked: 0, failed: 0, feedback: 0 }),
    totalFollowers: accountPerformance.reduce((sum, account) => sum + account.followers, 0),
    aiUsage,
    accountPerformance,
    topPosts: ownMetrics.slice(0, 10).map((post) => ({ externalId: post.external_id, accountHandle: post.handle, text: post.text, format: post.format || "post", category: post.category, capturedAt: post.captured_at, metrics: post.metrics })),
    categoryPerformance,
    formatPerformance,
    timePerformance,
    competitors,
    rangeDays,
    selectedAccountId,
    accountDetail,
    monitoring: getMonitoringPerformance(100),
    verificationBarometer,
    algorithmReference,
  };
}

// --- Jev ledger and cache (migration 16) -----------------------------------
// Owned by src/server/jev.ts. Rows hold only candidate ids and 0-2 scores:
// never prompts, credentials, endpoints or provider response bodies.

export type JevScoreRow = {
  id: number;
  subjectKind: string;
  subjectId: string;
  questionKey: string;
  score: number;
  mode: string;
  model: string;
  latencyMs: number;
  requestHash: string;
  diagnostics: string[];
  createdAt: number;
};

export type JevScoreEntry = { subjectId: string; questionKey: string; score: number };

export type JevCacheRow = { requestHash: string; scoresJson: string; reportedModel: string; createdAt: number };

export function recordJevScoreRows(input: {
  subjectKind: string;
  entries: JevScoreEntry[];
  mode: string;
  model: string;
  latencyMs: number;
  requestHash: string;
  diagnostics: string[];
  now: number;
}): number {
  const values = input.entries.map((entry) => `(${sqlString(input.subjectKind)}, ${sqlString(entry.subjectId)},
      ${sqlString(entry.questionKey)}, ${sqlReal(entry.score)}, ${sqlString(input.mode)}, ${sqlString(input.model)},
      ${sqlNumber(input.latencyMs)}, ${sqlString(input.requestHash)}, ${sqlString(JSON.stringify(input.diagnostics))},
      ${sqlNumber(input.now)})`);
  if (!values.length) return 0;
  exec(`INSERT INTO jev_scores
    (subject_kind, subject_id, question_key, score, mode, model, latency_ms, request_hash, diagnostics_json, created_at)
    VALUES ${values.join(", ")}
    ON CONFLICT(subject_kind, subject_id, question_key, request_hash) DO UPDATE SET
      score=excluded.score, mode=excluded.mode, model=excluded.model, latency_ms=excluded.latency_ms,
      diagnostics_json=excluded.diagnostics_json, created_at=excluded.created_at;`);
  return values.length;
}

export function latestJevScoresFor(
  subjectKind: string,
  subjectIds: string[],
): Map<string, Array<{ questionKey: string; score: number; createdAt: number }>> {
  const result = new Map<string, Array<{ questionKey: string; score: number; createdAt: number }>>();
  const ids = [...new Set(subjectIds.filter((value) => typeof value === "string" && value.length > 0))];
  if (!ids.length) return result;
  const list = ids.map(sqlString).join(", ");
  const found = rows<{ subject_id: string; question_key: string; score: number; created_at: number }>(
    `SELECT subject_id, question_key, score, created_at FROM jev_scores
      WHERE subject_kind=${sqlString(subjectKind)} AND subject_id IN (${list})
      ORDER BY created_at DESC, id DESC;`,
  );
  for (const row of found) {
    const bucket = result.get(row.subject_id) || [];
    if (bucket.some((item) => item.questionKey === row.question_key)) continue;
    bucket.push({ questionKey: row.question_key, score: row.score, createdAt: row.created_at });
    result.set(row.subject_id, bucket);
  }
  return result;
}

/**
 * Cheap change-detection stamps for the subjects of a Jev call.
 *
 * The contract (jev-context/02, "Gizlilik") asks the caller to re-read the source
 * version AFTER the response and drop scores whose subject moved while the
 * provider was thinking. These two helpers produce that version: a short hash, not
 * the content, so a stamp is safe to hold in memory and to compare. A subject that
 * has disappeared is simply absent from the map, which also reads as drift.
 */
function stamp(parts: unknown[]): string {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\u0000")).digest("hex").slice(0, 16);
}

/** externalId -> hash(text, observed_at). */
export function postVersionStamps(externalIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const ids = [...new Set(externalIds.filter((value) => typeof value === "string" && value.length > 0))];
  if (!ids.length) return result;
  const found = rows<{ external_id: string; text: string; observed_at: number }>(
    `SELECT external_id, text, observed_at FROM observed_posts WHERE external_id IN (${ids.map(sqlString).join(", ")});`,
  );
  for (const row of found) result.set(row.external_id, stamp([row.text, row.observed_at]));
  return result;
}

/** handle -> hash(profile_json, last_scored_at). */
export function sourceVersionStamps(handles: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const list = [...new Set(handles.filter((value) => typeof value === "string" && value.length > 0))];
  if (!list.length) return result;
  const found = rows<{ handle: string; profile_json: string }>(
    `SELECT handle, profile_json FROM sources WHERE handle IN (${list.map(sqlString).join(", ")});`,
  );
  for (const row of found) {
    let lastScoredAt: unknown = "";
    try {
      lastScoredAt = (JSON.parse(row.profile_json || "{}") as Record<string, unknown>).lastScoredAt;
    } catch {
      lastScoredAt = "";
    }
    result.set(row.handle, stamp([row.profile_json, lastScoredAt]));
  }
  return result;
}

export function getJevCacheEntry(requestHash: string, minCreatedAt: number): JevCacheRow | null {
  const row = rows<{ request_hash: string; scores_json: string; reported_model: string; created_at: number }>(
    `SELECT request_hash, scores_json, reported_model, created_at FROM jev_cache
      WHERE request_hash=${sqlString(requestHash)} AND created_at >= ${sqlNumber(minCreatedAt)} LIMIT 1;`,
  )[0];
  return row ? { requestHash: row.request_hash, scoresJson: row.scores_json, reportedModel: row.reported_model, createdAt: row.created_at } : null;
}

export function saveJevCacheEntry(requestHash: string, scoresJson: string, reportedModel: string, now: number): void {
  exec(`INSERT INTO jev_cache (request_hash, scores_json, reported_model, created_at)
    VALUES (${sqlString(requestHash)}, ${sqlString(scoresJson)}, ${sqlString(reportedModel)}, ${sqlNumber(now)})
    ON CONFLICT(request_hash) DO UPDATE SET scores_json=excluded.scores_json,
      reported_model=excluded.reported_model, created_at=excluded.created_at;`);
}

export function pruneJevCache(before: number): void {
  exec(`DELETE FROM jev_cache WHERE created_at < ${sqlNumber(before)};`);
}


// --- Voice profile and draft variants (migration 18) ------------------------

/**
 * A measured voice profile lives inside `accounts.style_profile_json` under the
 * additive `voice` key: it is derived data, it must travel with the account and
 * it must never overwrite the hand written style fields beside it.
 */
export function saveAccountVoiceProfile(accountId: number, voice: Record<string, unknown>, now: number): Account | null {
  const account = getAccounts().find((item) => item.id === accountId);
  if (!account) return null;
  return saveAccount({
    id: account.id,
    accountKey: account.accountKey,
    handle: account.handle,
    displayName: account.displayName,
    enabled: account.enabled,
    defaultAccount: account.defaultAccount,
    automationMode: account.automationMode,
    dailyLimit: account.dailyLimit,
    capabilities: account.capabilities,
    styleProfile: { ...account.styleProfile, voice },
    now,
  });
}

export function getAccountVoiceProfile(accountId: number): Record<string, unknown> | null {
  const account = getAccounts().find((item) => item.id === accountId);
  const voice = account?.styleProfile.voice;
  return voice && typeof voice === "object" && !Array.isArray(voice) ? voice as Record<string, unknown> : null;
}

export type DraftVariantRecord = {
  id: number;
  draftId: number;
  variantIndex: number;
  angle: string;
  format: string;
  text: string;
  chosen: boolean;
  evaluatorScore: number | null;
  jevScore: number | null;
  combinedScore: number | null;
  selectionMode: string;
  gateReason: string;
  detail: Record<string, unknown>;
  createdAt: number;
};

export type DraftVariantInput = {
  variantIndex: number;
  angle?: string;
  format?: string;
  text: string;
  chosen?: boolean;
  evaluatorScore?: number | null;
  jevScore?: number | null;
  combinedScore?: number | null;
  selectionMode?: string;
  gateReason?: string;
  detail?: Record<string, unknown>;
};

function nullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "NULL" : sqlNumber(value);
}

export function recordDraftVariants(input: { draftId: number; variants: DraftVariantInput[]; now: number }): number {
  if (!getDraft(input.draftId)) throw new Error("draft not found");
  const statements = input.variants.map((variant) => `INSERT INTO draft_variants (
      draft_id, variant_index, angle, format, text, chosen, evaluator_score, jev_score,
      combined_score, selection_mode, gate_reason, detail_json, created_at)
    VALUES (${sqlNumber(input.draftId)}, ${sqlNumber(variant.variantIndex)}, ${sqlString(variant.angle || "")},
      ${sqlString(variant.format || "post")}, ${sqlString(variant.text)}, ${variant.chosen ? 1 : 0},
      ${nullableNumber(variant.evaluatorScore)}, ${nullableNumber(variant.jevScore)},
      ${nullableNumber(variant.combinedScore)}, ${sqlString(variant.selectionMode || "evaluator")},
      ${sqlString(variant.gateReason || "")}, ${sqlString(JSON.stringify(variant.detail || {}))}, ${sqlNumber(input.now)})
    ON CONFLICT(draft_id, variant_index) DO UPDATE SET angle=excluded.angle, format=excluded.format,
      text=excluded.text, chosen=excluded.chosen, evaluator_score=excluded.evaluator_score,
      jev_score=excluded.jev_score, combined_score=excluded.combined_score,
      selection_mode=excluded.selection_mode, gate_reason=excluded.gate_reason,
      detail_json=excluded.detail_json;`);
  if (!statements.length) return 0;
  exec(statements.join("\n"));
  return statements.length;
}

export function getDraftVariants(draftId: number): DraftVariantRecord[] {
  if (!getDraft(draftId)) return [];
  return rows<{
    id: number; draft_id: number; variant_index: number; angle: string; format: string; text: string;
    chosen: number; evaluator_score: number | null; jev_score: number | null; combined_score: number | null;
    selection_mode: string; gate_reason: string; detail_json: string; created_at: number;
  }>(`SELECT * FROM draft_variants WHERE draft_id=${sqlNumber(draftId)} ORDER BY variant_index ASC;`).map((row) => ({
    id: row.id,
    draftId: row.draft_id,
    variantIndex: row.variant_index,
    angle: row.angle,
    format: row.format,
    text: row.text,
    chosen: row.chosen === 1,
    evaluatorScore: row.evaluator_score,
    jevScore: row.jev_score,
    combinedScore: row.combined_score,
    selectionMode: row.selection_mode,
    gateReason: row.gate_reason,
    detail: parseObject(row.detail_json),
    createdAt: row.created_at,
  }));
}

export type OwnUserProfile = { username: string; displayName: string; bio: string; visibility: "private" | "public"; createdAt: number; updatedAt: number; xHandle: string | null; avatarUrl: string | null; onboardingCompleted: boolean; profilePath: string };
export type PublicUserProfile = { username: string; displayName: string; bio: string; xHandle: string | null; avatarUrl: string | null; profilePath: string };

type UserProfileRow = { username: string; display_name: string; bio: string; visibility: "private" | "public"; created_at: number; updated_at: number; x_handle: string | null; avatar_url: string | null; onboarding_completed: number };

const RESERVED_PUBLIC_PROFILE_PATHS = new Set(["api", "app", "u", "h", "compare", "docs", "forgot-password", "leaderboard", "login", "market", "no-viral-guarantee", "open-source", "privacy", "research", "reset-password", "security", "settings", "signup", "terms", "transparency", "robots.txt", "sitemap.xml", "favicon.ico"]);
export function profilePathForIdentity(handle: string | null, username: string): string {
  const normalized = handle?.replace(/^@/, "") ?? "";
  return normalized && /^[A-Za-z0-9_]{1,15}$/.test(normalized) && !RESERVED_PUBLIC_PROFILE_PATHS.has(normalized.toLowerCase()) && !/^(en|zh-cn|hi|es|fr|ar|bn|pt-br|ru|id|ur|de|ja|sw|mr|te|tr|ta|vi|ko)$/i.test(normalized)
    ? `/${normalized}` : `/u/${username}`;
}

function profileFromRow(row: UserProfileRow): OwnUserProfile {
  const profilePath = profilePathForIdentity(row.x_handle, row.username);
  return { username: row.username, displayName: row.display_name, bio: row.bio, visibility: row.visibility, createdAt: row.created_at, updatedAt: row.updated_at, xHandle: row.x_handle, avatarUrl: row.avatar_url, onboardingCompleted: row.onboarding_completed === 1, profilePath };
}

function requireProfileOwner(): string {
  const ownerId = currentOwnerId();
  if (!ownerId) throw new Error("authenticated profile owner required");
  return ownerId;
}

export function getOwnUserProfile(now = Math.floor(Date.now() / 1000)): OwnUserProfile {
  const ownerId = requireProfileOwner();
  if (!ensureDatabase()) throw new Error("database unavailable");
  // A server-generated random slug avoids exposing email addresses or predictable account identifiers.
  let row: UserProfileRow | undefined;
  for (let attempt = 0; attempt < 3 && !row; attempt++) {
    const username = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
    if (new Set(username).size < 12) continue;
    try {
      command(`INSERT INTO user_profiles(owner_user_id,username,visibility,onboarding_completed,created_at,updated_at)
        VALUES(${sqlString(ownerId)},${sqlString(username)},'public',0,${sqlNumber(now)},${sqlNumber(now)}) ON CONFLICT(owner_user_id) DO NOTHING;`);
    } catch { /* Retry an astronomically unlikely random slug collision. */ }
    row = criticalRows<UserProfileRow>(
      `SELECT username,display_name,bio,visibility,created_at,updated_at,x_handle,avatar_url,onboarding_completed FROM user_profiles WHERE owner_user_id=${sqlString(ownerId)} LIMIT 1;`,
    )[0];
  }
  if (!row) throw new Error("profile could not be initialized");
  return profileFromRow(row);
}

export function saveOwnUserProfile(input: { displayName: string; bio: string; visibility: "private" | "public"; now?: number }): OwnUserProfile {
  const ownerId = requireProfileOwner();
  getOwnUserProfile(input.now);
  if (!ensureDatabase()) throw new Error("database unavailable");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  command(`UPDATE user_profiles SET display_name=${sqlString(input.displayName)},bio=${sqlString(input.bio)},visibility=${sqlString(input.visibility)},onboarding_completed=1,updated_at=${sqlNumber(now)}
    WHERE owner_user_id=${sqlString(ownerId)};`);
  return getOwnUserProfile(now);
}

export function getPublicUserProfile(username: string): PublicUserProfile | null {
  if (!ensureDatabase()) throw new Error("database unavailable");
  // Keep this projection explicit and visibility-gated; never return the owner key or private columns.
  const row = criticalRows<{ username: string; display_name: string; bio: string; x_handle: string | null; avatar_url: string | null }>(
    `SELECT username,display_name,bio,x_handle,avatar_url FROM user_profiles WHERE username=${sqlString(username)} AND visibility='public' AND onboarding_completed=1 LIMIT 1;`,
  )[0];
  return row ? { username: row.username, displayName: row.display_name, bio: row.bio, xHandle: row.x_handle, avatarUrl: row.avatar_url, profilePath: profilePathForIdentity(row.x_handle, row.username) } : null;
}

export function getPublicUserProfileByHandle(handle: string): PublicUserProfile | null {
  if (!ensureDatabase()) throw new Error("database unavailable");
  const row = criticalRows<{ username: string; display_name: string; bio: string; x_handle: string; avatar_url: string | null }>(
    `SELECT username,display_name,bio,x_handle,avatar_url FROM user_profiles WHERE lower(x_handle)=lower(${sqlString(handle)}) AND visibility='public' AND onboarding_completed=1 LIMIT 1;`,
  )[0];
  return row ? { username: row.username, displayName: row.display_name, bio: row.bio, xHandle: row.x_handle, avatarUrl: row.avatar_url, profilePath: profilePathForIdentity(row.x_handle, row.username) } : null;
}

export function getProfileAvatarAccess(xUserId: string, ownerUserId?: string): boolean {
  if (!ensureDatabase()) return false;
  const owner = ownerUserId ? ` OR profile.owner_user_id=${sqlString(ownerUserId)}` : "";
  return criticalRows<{ allowed: number }>(`SELECT 1 AS allowed FROM user_profiles profile JOIN user_profile_x_identity identity ON identity.owner_user_id=profile.owner_user_id
    WHERE identity.x_user_id=${sqlString(xUserId)} AND (profile.visibility='public' AND profile.onboarding_completed=1${owner}) LIMIT 1;`).length > 0;
}

export function syncUserProfileFromX(input: { ownerUserId: string; xUserId: string; handle: string; displayName: string; bio: string; avatarUrl: string | null; now?: number }): void {
  if (!ensureDatabase()) throw new Error("database unavailable");
  const handle = input.handle.replace(/^@/, "");
  if (!input.ownerUserId || !/^\d{1,32}$/.test(input.xUserId) || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("verified X profile identity is invalid");
  if (input.avatarUrl !== null && input.avatarUrl !== `/api/profile/avatar/${input.xUserId}`) throw new Error("X avatar must use the local profile proxy");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  runAsOwner(input.ownerUserId, () => getOwnUserProfile(now));
  const row = criticalRows<{ owner_user_id: string; x_user_id: string | null }>(`SELECT profile.owner_user_id,identity.x_user_id FROM user_profiles profile LEFT JOIN user_profile_x_identity identity ON identity.owner_user_id=profile.owner_user_id WHERE profile.owner_user_id=${sqlString(input.ownerUserId)} LIMIT 1;`)[0];
  if (!row) throw new Error("profile could not be initialized");
  // The first verified account owns the public identity; subsequent connections cannot replace it.
  if (row.x_user_id && row.x_user_id !== input.xUserId) return;
  if (!row.x_user_id) {
    const used = criticalRows<{ owner_user_id: string }>(`SELECT owner_user_id FROM user_profile_x_identity WHERE x_user_id=${sqlString(input.xUserId)} LIMIT 1;`)[0];
    if (used && used.owner_user_id !== input.ownerUserId) return;
    command(`INSERT INTO user_profile_x_identity(owner_user_id,x_user_id) VALUES(${sqlString(input.ownerUserId)},${sqlString(input.xUserId)}) ON CONFLICT(owner_user_id) DO NOTHING;`);
  }
  try {
    command(`UPDATE user_profiles SET x_handle=${sqlString(handle)},display_name=${sqlString(input.displayName.slice(0, 80))},bio=${sqlString(input.bio.slice(0, 500))},avatar_url=COALESCE(${input.avatarUrl === null ? "NULL" : sqlString(input.avatarUrl)},avatar_url),updated_at=${sqlNumber(now)}
      WHERE owner_user_id=${sqlString(input.ownerUserId)} AND EXISTS (SELECT 1 FROM user_profile_x_identity WHERE owner_user_id=${sqlString(input.ownerUserId)} AND x_user_id=${sqlString(input.xUserId)});`);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return;
    throw error;
  }
}

export type HitShareMetrics = { views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null };
export type ShareableXPost = { remotePostId: string; accountHandle: string; postUrl: string; text: string; publishedAt: number; metrics: HitShareMetrics; observedAt: number };
export type OwnHitShare = { publicId: string; remotePostId: string; createdAt: number; revokedAt: number | null; leaderboardOptIn: boolean };
export type PublicHitShare = ShareableXPost & { publicId: string; verification: "official_x_api" };

type HitEvidenceRow = {
  prediction_id: string; account_id: number; account_handle: string; intent_remote_post_id: string; remote_url: string;
  confirmed_at: number; published_text: string; observed_at: number; captured_at: number;
  views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; provenance_ref: string;
  followers_count?: number | null; followers_observed_at?: number | null; followers_x_user_id?: string | null;
  followers_provenance_ref?: string | null; censored_json?: string; x_user_id?: string; auth_state?: string;
};

function hitPostIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) return null;
    return url.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1] ?? null;
  } catch { return null; }
}

function mapHitEvidence(row: HitEvidenceRow): ShareableXPost | null {
  const remotePostId = hitPostIdFromUrl(row.remote_url);
  if (!remotePostId || row.intent_remote_post_id && row.intent_remote_post_id !== remotePostId) return null;
  const provenance = row.provenance_ref.match(/^official_x:(\d+):(\d+):published_at=(\d+)$/);
  if (!provenance || Number(provenance[1]) !== row.account_id || provenance[2] !== remotePostId) return null;
  const publishedAt = Number(provenance[3]);
  if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0 || row.observed_at < publishedAt || row.captured_at < row.observed_at) return null;
  if (![row.views, row.likes, row.replies, row.reposts, row.quotes].some((value) => value !== null)) return null;
  return {
    remotePostId, accountHandle: row.account_handle, postUrl: row.remote_url, text: row.published_text,
    publishedAt, observedAt: row.captured_at,
    metrics: { views: row.views, likes: row.likes, replies: row.replies, reposts: row.reposts, quotes: row.quotes },
  };
}

function hitEvidenceRows(ownerId: string, remotePostId?: string, leaderboard = false): HitEvidenceRow[] {
  const postFilter = remotePostId
    ? `AND (intent.remote_post_id=${sqlString(remotePostId)} OR intent.remote_url LIKE ${sqlString(`%/status/${remotePostId}`)} OR intent.remote_url LIKE ${sqlString(`%/status/${remotePostId}/`)})`
    : "";
  const observationFilter = leaderboard ? `AND latest.observed_at - CAST(substr(latest.provenance_ref,instr(latest.provenance_ref,'published_at=')+13) AS INTEGER) BETWEEN 86400 AND 108000` : "";
  return criticalRows<HitEvidenceRow>(`SELECT prediction.id AS prediction_id, account.id AS account_id, account.handle AS account_handle,
      intent.remote_post_id AS intent_remote_post_id, intent.remote_url, intent.confirmed_at,
      approval.text AS published_text, outcome.observed_at, outcome.captured_at,
      outcome.views, outcome.likes, outcome.replies, outcome.reposts, outcome.quotes, outcome.provenance_ref,
      outcome.followers_count, outcome.followers_observed_at, outcome.followers_x_user_id, outcome.followers_provenance_ref,
      outcome.censored_json, ${leaderboard ? "oauth.x_user_id, oauth.auth_state" : "NULL AS x_user_id,NULL AS auth_state"}
    FROM evaluation_predictions AS prediction
    INNER JOIN accounts AS account ON account.id=CAST(prediction.account_id AS INTEGER) AND account.owner_user_id=prediction.owner_user_id
    ${leaderboard ? "INNER JOIN x_oauth_accounts AS oauth ON oauth.account_id=account.id AND oauth.owner_user_id=prediction.owner_user_id" : ""}
    INNER JOIN publication_intents AS intent ON intent.account_id=account.id AND intent.status='confirmed' AND intent.confirmed_at IS NOT NULL
      AND prediction.created_at<=intent.requested_at
    INNER JOIN drafts AS intent_draft ON intent_draft.id=intent.draft_id AND intent_draft.owner_user_id=prediction.owner_user_id
    INNER JOIN publication_approval_snapshots AS approval ON approval.id=intent.approval_snapshot_id
      AND approval.entity_type='publication_intent' AND approval.entity_id=intent.id AND approval.draft_id=intent.draft_id AND approval.account_id=account.id
      AND approval.action='post' AND approval.format='post' AND approval.external_id=json_extract(prediction.features_json,'$.sourceCandidateId')
      AND approval.text=intent.text AND approval.approved_at>=prediction.created_at
      AND approval.approved_at<=COALESCE(intent.dispatched_at,intent.confirmed_at)
      AND approval.expires_at>=COALESCE(intent.dispatched_at,intent.confirmed_at)
    INNER JOIN evaluation_outcome_revisions AS outcome ON outcome.owner_user_id=prediction.owner_user_id
      AND outcome.prediction_id=prediction.id AND outcome.source='official_x_api'
      AND outcome.id=(SELECT latest.id FROM evaluation_outcome_revisions AS latest
        WHERE latest.owner_user_id=prediction.owner_user_id AND latest.prediction_id=prediction.id AND latest.source='official_x_api'
        ${observationFilter}
        ORDER BY latest.captured_at ${leaderboard ? "ASC" : "DESC"},latest.id ${leaderboard ? "ASC" : "DESC"} LIMIT 1)
    WHERE prediction.owner_user_id=${sqlString(ownerId)} AND prediction.action='post'
      AND json_extract(prediction.features_json,'$.decision')='eligible'
      AND outcome.provenance_ref LIKE ('official_x:' || account.id || ':%:published_at=%')
      AND (outcome.views IS NOT NULL OR outcome.likes IS NOT NULL OR outcome.replies IS NOT NULL OR outcome.reposts IS NOT NULL OR outcome.quotes IS NOT NULL)
      ${postFilter}
    ORDER BY outcome.captured_at DESC, prediction.id DESC LIMIT 500;`);
}

export function listOwnShareableXPosts(): ShareableXPost[] {
  const ownerId = requireProfileOwner();
  return hitEvidenceRows(ownerId).map(mapHitEvidence).filter((item): item is ShareableXPost => item !== null).slice(0, 100);
}

export function listOwnHitShares(): OwnHitShare[] {
  const ownerId = requireProfileOwner();
  return criticalRows<{ public_id: string; remote_post_id: string; created_at: number; revoked_at: number | null; leaderboard_opt_in: number }>(
    `SELECT public_id,remote_post_id,created_at,revoked_at,leaderboard_opt_in FROM hit_shares WHERE owner_user_id=${sqlString(ownerId)} ORDER BY created_at DESC,id DESC LIMIT 100;`,
  ).map((row) => ({ publicId: row.public_id, remotePostId: row.remote_post_id, createdAt: row.created_at, revokedAt: row.revoked_at, leaderboardOptIn: row.leaderboard_opt_in === 1 }));
}

export function createOwnHitShare(remotePostId: string, now = Math.floor(Date.now() / 1000)): OwnHitShare {
  const ownerId = requireProfileOwner();
  if (!/^\d{1,32}$/.test(remotePostId)) throw new Error("geçerli bir 𝕏 gönderi kimliği gerekli");
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("paylaşım zamanı geçersiz");
  if (!ensureDatabase()) throw new Error("database unavailable");
  command("BEGIN IMMEDIATE;");
  try {
    const hit = hitEvidenceRows(ownerId, remotePostId).map(mapHitEvidence).find((item) => item?.remotePostId === remotePostId);
    if (!hit) throw new Error("resmi 𝕏 verisiyle doğrulanmış kendi gönderisi bulunamadı");
    const existing = criticalRows<{ public_id: string; remote_post_id: string; created_at: number; revoked_at: number | null; leaderboard_opt_in: number }>(
      `SELECT public_id,remote_post_id,created_at,revoked_at,leaderboard_opt_in FROM hit_shares WHERE owner_user_id=${sqlString(ownerId)} AND remote_post_id=${sqlString(remotePostId)} AND revoked_at IS NULL LIMIT 1;`,
    )[0];
    if (existing) {
      command("COMMIT;");
      return { publicId: existing.public_id, remotePostId: existing.remote_post_id, createdAt: existing.created_at, revokedAt: existing.revoked_at, leaderboardOptIn: existing.leaderboard_opt_in === 1 };
    }
    const candidate = hitEvidenceRows(ownerId, remotePostId).find((row) => mapHitEvidence(row)?.remotePostId === remotePostId);
    if (!candidate) throw new Error("resmi 𝕏 verisiyle doğrulanmış kendi gönderisi bulunamadı");
    let publicId = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      publicId = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
      try {
        command(`INSERT INTO hit_shares(public_id,owner_user_id,account_id,prediction_id,remote_post_id,created_at,revoked_at)
          VALUES(${sqlString(publicId)},${sqlString(ownerId)},${sqlNumber(candidate.account_id)},${sqlString(candidate.prediction_id)},${sqlString(remotePostId)},${sqlNumber(now)},NULL);`);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        publicId = "";
      }
    }
    if (!publicId) throw new Error("paylaşım bağlantısı oluşturulamadı");
    command("COMMIT;");
    return { publicId, remotePostId, createdAt: now, revokedAt: null, leaderboardOptIn: false };
  } catch (error) {
    command("ROLLBACK;");
    throw error;
  }
}

export function revokeOwnHitShare(publicId: string, now = Math.floor(Date.now() / 1000)): boolean {
  const ownerId = requireProfileOwner();
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId)) return false;
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("revoke time is invalid");
  const changed = criticalRows<{ public_id: string }>(`UPDATE hit_shares SET revoked_at=${sqlNumber(now)}
    WHERE public_id=${sqlString(publicId)} AND owner_user_id=${sqlString(ownerId)} AND revoked_at IS NULL RETURNING public_id;`);
  return changed.length > 0;
}

export function getPublicHitShare(publicId: string): PublicHitShare | null {
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId)) return null;
  const row = criticalRows<HitEvidenceRow & { public_id: string }>(`SELECT hit.public_id,
      prediction.id AS prediction_id, account.id AS account_id, account.handle AS account_handle,
      intent.remote_post_id AS intent_remote_post_id, intent.remote_url, intent.confirmed_at,
      approval.text AS published_text, outcome.observed_at, outcome.captured_at,
      outcome.views, outcome.likes, outcome.replies, outcome.reposts, outcome.quotes, outcome.provenance_ref
    FROM hit_shares AS hit
    INNER JOIN evaluation_predictions AS prediction ON prediction.id=hit.prediction_id AND prediction.owner_user_id=hit.owner_user_id
    INNER JOIN accounts AS account ON account.id=hit.account_id AND account.owner_user_id=hit.owner_user_id AND account.id=CAST(prediction.account_id AS INTEGER)
    INNER JOIN publication_intents AS intent ON intent.account_id=account.id AND intent.status='confirmed' AND intent.confirmed_at IS NOT NULL
    INNER JOIN drafts AS intent_draft ON intent_draft.id=intent.draft_id AND intent_draft.owner_user_id=prediction.owner_user_id
    INNER JOIN publication_approval_snapshots AS approval ON approval.id=intent.approval_snapshot_id
      AND approval.entity_type='publication_intent' AND approval.entity_id=intent.id AND approval.draft_id=intent.draft_id AND approval.account_id=account.id
      AND approval.action='post' AND approval.format='post' AND approval.external_id=json_extract(prediction.features_json,'$.sourceCandidateId')
      AND approval.text=intent.text AND approval.approved_at>=prediction.created_at
      AND approval.approved_at<=COALESCE(intent.dispatched_at,intent.confirmed_at)
      AND approval.expires_at>=COALESCE(intent.dispatched_at,intent.confirmed_at)
    INNER JOIN evaluation_outcome_revisions AS outcome ON outcome.owner_user_id=hit.owner_user_id
      AND outcome.prediction_id=prediction.id AND outcome.source='official_x_api'
      AND outcome.id=(SELECT latest.id FROM evaluation_outcome_revisions AS latest
        WHERE latest.owner_user_id=hit.owner_user_id AND latest.prediction_id=prediction.id AND latest.source='official_x_api'
        ORDER BY latest.captured_at DESC,latest.id DESC LIMIT 1)
    WHERE hit.public_id=${sqlString(publicId)} AND hit.revoked_at IS NULL
      AND (intent.remote_post_id='' OR hit.remote_post_id=intent.remote_post_id)
      AND prediction.action='post' AND prediction.created_at<=intent.requested_at
      AND json_extract(prediction.features_json,'$.decision')='eligible'
      AND outcome.provenance_ref LIKE ('official_x:' || account.id || ':' || hit.remote_post_id || ':published_at=%')
      AND (outcome.views IS NOT NULL OR outcome.likes IS NOT NULL OR outcome.replies IS NOT NULL OR outcome.reposts IS NOT NULL OR outcome.quotes IS NOT NULL)
    LIMIT 1;`)[0];
  if (!row) return null;
  const hit = mapHitEvidence(row);
  return hit ? { ...hit, publicId: row.public_id, verification: "official_x_api" } : null;
}

/** Explicit per-card participation, independent from sharing and profile visibility. */
export function setOwnHitLeaderboardOptIn(publicId: string, enabled: boolean): boolean {
  const ownerId = requireProfileOwner();
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId) || typeof enabled !== "boolean") return false;
  return criticalRows<{ public_id: string }>(`UPDATE hit_shares SET leaderboard_opt_in=${enabled ? 1 : 0}
    WHERE public_id=${sqlString(publicId)} AND owner_user_id=${sqlString(ownerId)} AND revoked_at IS NULL RETURNING public_id;`).length > 0;
}

/** Operator-only moderation persists across share revocation and recreation. */
export function setHitEvidenceExcluded(publicId: string, excluded: boolean, reason: string, now = Math.floor(Date.now()/1000)): boolean {
  const operator = currentOwnerId();
  if (!operator || operator !== process.env.ISPATLA_OPERATOR_USER_ID) throw new Error("operator authorization required");
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId) || typeof excluded !== "boolean" || typeof reason !== "string" || reason.length > 500 || excluded && !reason.trim()) throw new Error("invalid moderation request");
  const hit = criticalRows<{owner_user_id:string;account_id:number;remote_post_id:string}>(`SELECT owner_user_id,account_id,remote_post_id FROM hit_shares WHERE public_id=${sqlString(publicId)} LIMIT 1;`)[0];
  if (!hit) return false;
  const key = `owner_user_id=${sqlString(hit.owner_user_id)} AND account_id=${sqlNumber(hit.account_id)} AND remote_post_id=${sqlString(hit.remote_post_id)}`;
  if (excluded) command(`INSERT INTO hit_evidence_exclusions(owner_user_id,account_id,remote_post_id,reason,flagged_at)
    VALUES(${sqlString(hit.owner_user_id)},${sqlNumber(hit.account_id)},${sqlString(hit.remote_post_id)},${sqlString(reason.trim())},${sqlNumber(now)})
    ON CONFLICT(owner_user_id,account_id,remote_post_id) DO UPDATE SET reason=excluded.reason,flagged_at=excluded.flagged_at;`);
  else command(`DELETE FROM hit_evidence_exclusions WHERE ${key};`);
  return true;
}

export type LeaderboardEvidence = ShareableXPost & {
  ownerUserId: string; accountId: number; followers: number; publicId: string | null;
};

/** Internal evidence only; the public service projects no owner IDs or unshared posts. */
export function listQualifiedLeaderboardEvidence(): LeaderboardEvidence[] {
  if (!ensureDatabase()) throw new Error("database unavailable");
  const shares = criticalRows<{owner_user_id:string;account_id:number;remote_post_id:string;public_id:string;prediction_id:string}>(`SELECT owner_user_id,account_id,remote_post_id,public_id,prediction_id FROM hit_shares
    WHERE revoked_at IS NULL AND leaderboard_opt_in=1 ORDER BY created_at DESC,id DESC LIMIT 500;`);
  const result: LeaderboardEvidence[] = [];
  for (const owner of new Set(shares.map((share) => share.owner_user_id))) {
    const excluded = criticalRows<{account_id:number;remote_post_id:string}>(`SELECT account_id,remote_post_id FROM hit_evidence_exclusions WHERE owner_user_id=${sqlString(owner)};`);
    const seen = new Set<string>();
    for (const row of hitEvidenceRows(owner, undefined, true)) {
      const post = mapHitEvidence(row);
      if (!post || row.auth_state !== "connected" || !Number.isSafeInteger(row.followers_count) || (row.followers_count ?? 0) <= 0
        || row.followers_observed_at !== row.observed_at || row.followers_x_user_id !== row.x_user_id
        || row.followers_provenance_ref !== `official_x_user:${row.account_id}:${row.x_user_id}`
        || !["[]", '["views"]'].includes(row.censored_json ?? "") || [row.likes,row.replies,row.reposts,row.quotes].some((value) => value === null || !Number.isSafeInteger(value) || value < 0)
        || excluded.some((item) => item.account_id === row.account_id && item.remote_post_id === post.remotePostId)) continue;
      const key = `${row.account_id}:${post.remotePostId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const share = shares.find((item) => item.owner_user_id === owner && item.account_id === row.account_id && item.remote_post_id === post.remotePostId && item.prediction_id === row.prediction_id);
      if (share && !getPublicHitShare(share.public_id)) continue;
      result.push({ ...post, observedAt: row.observed_at, ownerUserId: owner, accountId: row.account_id, followers: row.followers_count!, publicId: share?.public_id ?? null });
    }
  }
  return result;
}
