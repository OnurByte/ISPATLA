import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { historicalPerformanceScore, isNumericalHit, observedEngagement, opportunityFreshness, opportunityScore, OPPORTUNITY_MAX_AGE_SECONDS, scorePost } from "./scoring";
import type { MetricSnapshot } from "./scoring";

type NativeDatabase = InstanceType<typeof DatabaseSync>;

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
  automationEnabled: boolean;
  openaiConfigured: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
  aiProvider: "api" | "compatible" | "codex";
  xuseAvailable: boolean;
  xuseBin: string;
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

export const AUTOMATION_TASK_IDS = ["monitor_engine", "source_scan", "source_liveness", "queue_worker", "reconciliation"] as const;
export type AutomationTaskId = (typeof AUTOMATION_TASK_IDS)[number];
export type AutomationTaskStatus = "never" | "running" | "success" | "partial" | "failed" | "skipped";
export type AutomationTaskSchedule = { id: AutomationTaskId; enabled: boolean; intervalSeconds: number; nextRunAt: number; lastRunAt: number; lastStatus: AutomationTaskStatus; updatedAt: number };
export type AutomationLog = { id: number; taskId: AutomationTaskId; status: AutomationTaskStatus; startedAt: number; finishedAt: number | null; message: string; details: Record<string, unknown> };

export type Account = {
  id: number;
  accountKey: string;
  handle: string;
  displayName: string;
  xuseAccountId: string;
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
};

export type SourceCategoryConfig = {
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
  xuseQueueId: string;
  xuseStatus: string;
  xuseCheckedAt: number;
  remoteUrl: string;
  reconciliationStatus: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
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

export type PublicationIntentStatus = "pending_approval" | "approved" | "dispatching" | "xuse_queued" | "pending_reconciliation" | "confirmed" | "blocked" | "cancelled" | "reconciliation_required";
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
  xuseQueueId: string;
  receipt: string;
  remoteUrl: string;
  reason: string;
  requestedAt: number;
  approvedAt: number | null;
  dispatchedAt: number | null;
  confirmedAt: number | null;
  updatedAt: number;
};

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

const DATABASE_PATH =
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
  xuse_account_id TEXT NOT NULL DEFAULT '',
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
  xuse_queue_id TEXT NOT NULL DEFAULT '',
  xuse_status TEXT NOT NULL DEFAULT '',
  xuse_checked_at INTEGER NOT NULL DEFAULT 0,
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
      xuse_queue_id TEXT NOT NULL DEFAULT '',
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
}

export function ensureDatabase(): boolean {
  if (initialized) return true;
  if (initializationError) return false;

  try {
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
      ["automation_jobs", "xuse_queue_id", "TEXT NOT NULL DEFAULT ''"],
      ["automation_jobs", "xuse_status", "TEXT NOT NULL DEFAULT ''"],
      ["automation_jobs", "xuse_checked_at", "INTEGER NOT NULL DEFAULT 0"],
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
  const configuredSources = new Set(getSourceCategoryConfigs().filter((item) => item.enabled).map((item) => item.sourceHandle));
  return selectPosts(`${opportunityWhere(now)} AND score_reason LIKE 'deterministic:%' AND publish_status IN ('not_started','blocked')`, "created_timestamp DESC")
    .filter((post) => configuredSources.has(post.sourceHandle))
    .filter((post) => opportunityScoreForPost(post, now) >= 70)
    .sort((left, right) => opportunityScoreForPost(right, now) - opportunityScoreForPost(left, now) || right.createdTimestamp - left.createdTimestamp)
    .slice(0, limit);
}

export function hasPublishedCluster(clusterKey: string, accountId?: number): boolean {
  if (accountId) {
    return criticalRows<{ count: number }>(`SELECT (
      SELECT COUNT(*) FROM publications INNER JOIN opportunity_clusters ON opportunity_clusters.id=publications.cluster_id
      WHERE opportunity_clusters.cluster_key=${sqlString(clusterKey)} AND publications.account_id=${sqlNumber(accountId)}
        AND publications.status IN ('pending_reconciliation','confirmed')
    ) + (
      SELECT COUNT(*) FROM publication_intents INNER JOIN drafts ON drafts.id=publication_intents.draft_id
      INNER JOIN observed_posts ON observed_posts.external_id=drafts.external_id
      WHERE observed_posts.cluster_key=${sqlString(clusterKey)} AND publication_intents.account_id=${sqlNumber(accountId)}
        AND publication_intents.status IN ('pending_approval','approved','dispatching','xuse_queued','pending_reconciliation','reconciliation_required')
    ) AS count;`)[0]?.count > 0;
  }
  return criticalRows<{ count: number }>(`SELECT COUNT(*) as count FROM observed_posts
    WHERE cluster_key=${sqlString(clusterKey)} AND publish_status IN ('pending_reconciliation','confirmed');`)[0]?.count > 0;
}

export function recentPublishCount(now: number, accountId?: number): number {
  const accountWhere = accountId ? ` AND account_id=${sqlNumber(accountId)}` : "";
  return criticalRows<{ count: number }>(`SELECT COUNT(*) as count FROM publish_attempts
    WHERE created_at >= ${sqlNumber(now - 86400)}
      AND status IN ('pending_reconciliation','confirmed')${accountWhere};`)[0]?.count || 0;
}

export function accountPublishingReady(accountId: number, now: number, failureLimit = 3): boolean {
  if (!Number.isInteger(accountId) || accountId < 1) return false;
  const attempts = criticalRows<{ status: string }>(`SELECT status FROM publish_attempts
    WHERE account_id=${sqlNumber(accountId)} AND created_at >= ${sqlNumber(now - 86400)}
    ORDER BY created_at DESC, id DESC LIMIT ${sqlNumber(failureLimit)};`);
  return attempts.length < failureLimit || attempts.some((attempt) => attempt.status !== "blocked");
}

export function recentCategoryPublishCount(now: number, accountId: number, categorySlug: string): number {
  const wanted = categorySlug.toLocaleLowerCase("tr-TR");
  return criticalRows<{ score_reason: string }>(`SELECT observed_posts.score_reason FROM publish_attempts
      INNER JOIN observed_posts ON observed_posts.external_id=publish_attempts.post_external_id
      WHERE publish_attempts.created_at >= ${sqlNumber(now - 86400)}
        AND publish_attempts.account_id=${sqlNumber(accountId)}
        AND publish_attempts.status IN ('pending_reconciliation','confirmed');`)
    .filter((item) => scoreEvidenceFor(item.score_reason, 0).categories.some((category) => category.toLocaleLowerCase("tr-TR") === wanted)).length;
}

export function lastPublishAt(accountId: number): number {
  return criticalRows<{ created_at: number }>(`SELECT created_at FROM publish_attempts
    WHERE account_id=${sqlNumber(accountId)} AND status IN ('pending_reconciliation','confirmed')
    ORDER BY created_at DESC LIMIT 1;`)[0]?.created_at || 0;
}

export function clusterPosts(cluster: string, now = Math.floor(Date.now() / 1000)): RecentPost[] {
  return cluster ? selectPosts(`cluster_key=${sqlString(cluster)} AND sensitive=0 AND created_timestamp >= ${sqlNumber(now - 24 * 60 * 60)}`, "score DESC, created_timestamp DESC", 5) : [];
}

export function markDraft(externalId: string, text: string, status: string): void {
  exec(`UPDATE observed_posts SET draft_text=${sqlString(text)}, draft_status=${sqlString(status)}
    WHERE external_id=${sqlString(externalId)};`);
}

export function getPost(externalId: string): RecentPost | null {
  return rows<RecentPost>(`SELECT
    external_id as externalId, source_handle as sourceHandle, author_handle as authorHandle,
    status_url as statusUrl, text, created_timestamp as createdTimestamp, likes, replies,
    reposts, quotes, views, author_followers as followers, media_count as mediaCount, media_json as mediaJson,
    raw_json as rawJson, score, score_reason as scoreReason, sensitive, cluster_key as clusterKey,
    observed_at as observedAt, draft_text as draftText, draft_status as draftStatus, publish_status as publishStatus
    FROM observed_posts WHERE external_id=${sqlString(externalId)} LIMIT 1;`)[0] || null;
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
  status: string;
  reason: string;
  receipt: string;
  remoteUrl?: string;
  now: number;
}): void {
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
    (post_external_id, account_id, status, reason, receipt, remote_url, created_at, updated_at, occurrences)
    VALUES (${sqlString(input.externalId)}, ${accountSql}, ${sqlString(input.status)},
      ${sqlString(input.reason)}, ${sqlString(input.receipt)},
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

export function confirmPublish(attemptId: number, externalId: string): void {
  const attempt = criticalRows<{ account_id: number | null; remote_url: string }>(`SELECT account_id, remote_url FROM publish_attempts
    WHERE id=${sqlNumber(attemptId)} LIMIT 1;`)[0];
  exec(`UPDATE publish_attempts SET status='confirmed', reason='FxTwitter reconciliation confirmed'
    WHERE id=${sqlNumber(attemptId)};`);
  exec(`UPDATE observed_posts SET publish_status='confirmed'
    WHERE external_id=${sqlString(externalId)};`);
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
    observed_at as observedAt, draft_text as draftText, draft_status as draftStatus, publish_status as publishStatus
    FROM observed_posts`;
const MARKET_POST_COLUMNS = POST_COLUMNS.replace("raw_json as rawJson", "'' as rawJson");

function selectPosts(where: string, orderBy: string, limit?: number, columns = POST_COLUMNS): RecentPost[] {
  const whereSql = where ? ` WHERE ${where}` : "";
  const limitSql = limit === undefined ? "" : ` LIMIT ${sqlNumber(limit)}`;
  return rows<RecentPost>(`${columns}${whereSql} ORDER BY ${orderBy}${limitSql};`);
}

function selectMarketPosts(where: string, orderBy: string, limit?: number): RecentPost[] {
  return selectPosts(where, orderBy, limit, MARKET_POST_COLUMNS);
}

export function getRecentPosts(limit = 15): RecentPost[] {
  return selectPosts("", "observed_at DESC", limit);
}

export function getSummary(sourceCount: number): Omit<DashboardSummary, "generatedAt" | "automationEnabled" | "openaiConfigured" | "aiEnabled" | "aiConfigured" | "aiProvider" | "xuseAvailable" | "xuseBin"> {
  const now = Math.floor(Date.now() / 1000);
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
    (SELECT COUNT(*) FROM publish_attempts WHERE status='pending_reconciliation') as attemptsPending,
    (SELECT COUNT(*) FROM publish_attempts WHERE status='confirmed') as publishedConfirmed,
    (SELECT COUNT(*) FROM publish_attempts WHERE status='blocked') as publishBlocked;`)[0];
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
  }>(`SELECT id, slug, name, enabled, built_in, base_strategy, cluster_strategy, verification_mode, description,
      positive_examples_json, negative_examples_json, keywords_json, excluded_keywords_json, seed_handles_json, default_formats_json,
      source_policy_json, risk_policy_json, scoring_policy_json, publishing_policy_json, ai_context, created_at, updated_at
      FROM categories ORDER BY built_in DESC, slug;`).map((category) => ({
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
  }));
}

export function getCategories(): CategoryDefinition[] {
  return categoryRows();
}

export function deleteCategory(id: number): boolean {
  const category = categoryRows().find((item) => item.id === id);
  if (!category) return false;
  if (category.builtIn) throw new Error("built-in category silinemez");
  exec("BEGIN;");
  try {
    exec(`DELETE FROM account_categories WHERE category_id=${sqlNumber(id)};`);
    exec(`DELETE FROM source_categories WHERE category_id=${sqlNumber(id)};`);
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
  const where = accountId ? `WHERE mapping.account_id=${sqlNumber(accountId)}` : "";
  return rows<{
    account_id: number; category_id: number; slug: string; name: string; enabled: number; is_primary: number; weight: number; priority: number;
    publish_threshold: number | null; daily_budget: number | null; style_override_json: string; ai_route_override_json: string;
  }>(`SELECT mapping.account_id, mapping.category_id, categories.slug, categories.name, mapping.enabled, mapping.is_primary,
      mapping.weight, mapping.priority, mapping.publish_threshold, mapping.daily_budget, mapping.style_override_json, mapping.ai_route_override_json
      FROM account_categories AS mapping INNER JOIN categories ON categories.id=mapping.category_id ${where}
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
  }));
}

export function saveAccountCategoryConfig(input: Omit<AccountCategoryConfig, "categorySlug" | "categoryName">): AccountCategoryConfig {
  if (!getAccounts().some((account) => account.id === input.accountId)) throw new Error("account bulunamadı");
  if (!getCategories().some((category) => category.id === input.categoryId)) throw new Error("category bulunamadı");
  if (input.primary && !input.enabled) throw new Error("primary category etkin olmalı");
  if (!Number.isFinite(input.weight) || input.weight < 0 || input.weight > 10) throw new Error("category weight geçersiz");
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw new Error("category priority geçersiz");
  if (input.publishThreshold !== null && (!Number.isFinite(input.publishThreshold) || input.publishThreshold < 0 || input.publishThreshold > 100)) throw new Error("publish threshold geçersiz");
  if (input.dailyBudget !== null && (!Number.isInteger(input.dailyBudget) || input.dailyBudget < 1 || input.dailyBudget > 100)) throw new Error("daily budget geçersiz");
  exec("BEGIN;");
  try {
    if (input.primary) exec(`UPDATE account_categories SET is_primary=0 WHERE account_id=${sqlNumber(input.accountId)};`);
    exec(`INSERT INTO account_categories (
      account_id, category_id, enabled, is_primary, weight, priority, publish_threshold, daily_budget, style_override_json, ai_route_override_json
    ) VALUES (
      ${sqlNumber(input.accountId)}, ${sqlNumber(input.categoryId)}, ${sqlBool(input.enabled)}, ${sqlBool(input.primary)},
      ${input.weight}, ${sqlNumber(input.priority)}, ${input.publishThreshold === null ? "NULL" : input.publishThreshold},
      ${input.dailyBudget === null ? "NULL" : sqlNumber(input.dailyBudget)}, ${sqlString(JSON.stringify(input.styleOverride))}, ${sqlString(JSON.stringify(input.aiRouteOverride))}
    ) ON CONFLICT(account_id, category_id) DO UPDATE SET
      enabled=excluded.enabled, is_primary=excluded.is_primary, weight=excluded.weight, priority=excluded.priority,
      publish_threshold=excluded.publish_threshold, daily_budget=excluded.daily_budget,
      style_override_json=excluded.style_override_json, ai_route_override_json=excluded.ai_route_override_json;`);
    exec("COMMIT;");
  } catch (error) {
    exec("ROLLBACK;");
    throw error;
  }
  const result = getAccountCategoryConfigs(input.accountId).find((item) => item.categoryId === input.categoryId);
  if (!result) throw new Error("account category kaydedilemedi");
  return result;
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

export function saveSourceCategoryConfig(input: Omit<SourceCategoryConfig, "categorySlug" | "categoryName">): SourceCategoryConfig {
  if (!getStoredSources().some((source) => source.handle === input.sourceHandle)) throw new Error("kaynak bulunamadı");
  if (!getCategories().some((category) => category.id === input.categoryId)) throw new Error("category bulunamadı");
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
    ai_context, created_at, updated_at
  ) VALUES (
    ${sqlString(slug)}, ${sqlString(name)}, ${sqlBool(input.enabled)}, ${sqlBool(input.builtIn)},
    ${sqlString(input.baseStrategy)}, ${sqlString(input.clusterStrategy)}, ${sqlString(input.verificationMode)}, ${sqlString(description)},
    ${sqlString(JSON.stringify(positiveExamples))}, ${sqlString(JSON.stringify(negativeExamples))}, ${sqlString(JSON.stringify(keywords))},
    ${sqlString(JSON.stringify(excludedKeywords))}, ${sqlString(JSON.stringify(seedHandles))}, ${sqlString(JSON.stringify(defaultFormats.length ? defaultFormats : ["post"]))},
    ${sqlString(JSON.stringify(input.sourcePolicy))}, ${sqlString(JSON.stringify(input.riskPolicy))}, ${sqlString(JSON.stringify(input.scoringPolicy))},
    ${sqlString(JSON.stringify(input.publishingPolicy))}, ${sqlString(input.aiContext.slice(0, 8_000))}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
  );`);
  const category = categoryRows().find((item) => id ? item.id === id : item.slug === slug);
  if (!category) throw new Error("category kaydedilemedi");
  return category;
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
  exec(`DELETE FROM sources WHERE handle=${sqlString(handle)};`);
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
    xuse_account_id: string;
    enabled: number;
    default_account: number;
    automation_mode: string;
    daily_limit: number;
    capabilities_json: string;
    style_profile_json: string;
    verification_status: string | null;
    updated_at: number;
  }>(`SELECT id, account_key, handle, display_name, xuse_account_id, enabled,
      default_account, automation_mode, daily_limit, capabilities_json,
      style_profile_json,
      (SELECT verification_status FROM account_metric_snapshots profile WHERE profile.account_id=accounts.id ORDER BY profile.captured_at DESC LIMIT 1) AS verification_status,
      updated_at FROM accounts ORDER BY default_account DESC, handle;`).map((account) => ({
    id: account.id,
    accountKey: account.account_key,
    handle: account.handle,
    displayName: account.display_name,
    xuseAccountId: account.xuse_account_id,
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
  xuseAccountId: string;
  enabled: boolean;
  defaultAccount: boolean;
  automationMode: "manual" | "auto";
  dailyLimit: number;
  capabilities: string[];
  styleProfile?: Record<string, unknown>;
  subscriptionHistory?: unknown;
  now: number;
}): Account {
  const styleProfile = { ...(input.styleProfile || {}) };
  if ("editorialInstruction" in styleProfile) {
    const instruction = writeEditorialInstruction(styleProfile.editorialInstruction, "");
    if (instruction) styleProfile.editorialInstruction = instruction;
    else delete styleProfile.editorialInstruction;
  }
  if ("categories" in styleProfile) {
    const categories = canonicalCategorySlugs(styleProfile.categories);
    if (!categories) throw new Error("account kategorileri katalogdan seçilmeli");
    styleProfile.categories = categories;
  }
  if (input.defaultAccount) {
    exec("UPDATE accounts SET default_account=0;");
  }
  const id = input.id && Number.isInteger(input.id) ? input.id : 0;
  if (id > 0) {
    exec(`UPDATE accounts SET account_key=${sqlString(input.accountKey)}, handle=${sqlString(input.handle)},
      display_name=${sqlString(input.displayName)}, xuse_account_id=${sqlString(input.xuseAccountId)},
      enabled=${sqlBool(input.enabled)}, default_account=${sqlBool(input.defaultAccount)},
      automation_mode=${sqlString(input.automationMode)}, daily_limit=${sqlNumber(input.dailyLimit)},
      capabilities_json=${sqlString(JSON.stringify(input.capabilities))},
      style_profile_json=${sqlString(JSON.stringify(styleProfile))}, updated_at=${sqlNumber(input.now)}
      WHERE id=${sqlNumber(id)};`);
  } else {
    exec(`INSERT INTO accounts (account_key, handle, display_name, xuse_account_id, enabled,
      default_account, automation_mode, daily_limit, capabilities_json, style_profile_json, updated_at)
      VALUES (${sqlString(input.accountKey)}, ${sqlString(input.handle)}, ${sqlString(input.displayName)},
      ${sqlString(input.xuseAccountId)}, ${sqlBool(input.enabled)}, ${sqlBool(input.defaultAccount)},
      ${sqlString(input.automationMode)}, ${sqlNumber(input.dailyLimit)},
      ${sqlString(JSON.stringify(input.capabilities))}, ${sqlString(JSON.stringify(styleProfile))},
      ${sqlNumber(input.now)});`);
  }
  const savedId = id > 0 ? id : getAccounts().find((account) => account.accountKey === input.accountKey)?.id;
  if (!savedId) throw new Error("account could not be saved");
  if (input.subscriptionHistory !== undefined) replaceSubscriptionHistory(savedId, input.subscriptionHistory, input.now);
  const result = getAccounts().find((account) => account.id === savedId);
  if (!result) throw new Error("account could not be saved");
  return result;
}

export function deleteAccount(id: number): void {
  exec(`DELETE FROM automation_jobs WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM drafts WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_metric_snapshots WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_subscription_events WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM account_subscription_state WHERE account_id=${sqlNumber(id)};`);
  exec(`DELETE FROM accounts WHERE id=${sqlNumber(id)};`);
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
  return opportunityScoreForPost(post, now) >= 70 ? "opportunity" : "below_threshold";
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
  return selectPosts(opportunityWhere(now), "created_timestamp DESC").filter((post) => scoreEvidenceFor(post.scoreReason, post.score).kind === "deterministic" && opportunityScoreForPost(post, now) >= 70).length;
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

export function opportunityScoreForPost(post: Pick<RecentPost, "score" | "scoreReason" | "sensitive" | "createdTimestamp">, now = Math.floor(Date.now() / 1000)): number {
  const evidence = scoreEvidenceFor(post.scoreReason, post.score);
  return opportunityScore(post.score, post.createdTimestamp, post.sensitive ? 100 : evidence.risk, now);
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
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  }));
}

export function getDraft(id: number): DraftRecord | null {
  return getDrafts(200).find((draft) => draft.id === id) || null;
}

type PublicationIntentRow = {
  id: number; draft_id: number; account_id: number; handle: string | null; status: PublicationIntentStatus;
  idempotency_key: string; text: string; media_path: string; media_hash: string; xuse_queue_id: string;
  receipt: string; remote_url: string; reason: string; requested_at: number; approved_at: number | null;
  dispatched_at: number | null; confirmed_at: number | null; updated_at: number;
};

function publicationIntent(row: PublicationIntentRow): PublicationIntent {
  return {
    id: row.id, draftId: row.draft_id, accountId: row.account_id, accountHandle: row.handle || "",
    status: row.status, idempotencyKey: row.idempotency_key, text: row.text, mediaPath: row.media_path,
    mediaHash: row.media_hash, xuseQueueId: row.xuse_queue_id, receipt: row.receipt, remoteUrl: row.remote_url,
    reason: row.reason, requestedAt: row.requested_at, approvedAt: row.approved_at,
    dispatchedAt: row.dispatched_at, confirmedAt: row.confirmed_at, updatedAt: row.updated_at,
  };
}

export function getPublicationIntents(input: { status?: PublicationIntentStatus; limit?: number } = {}): PublicationIntent[] {
  return rows<PublicationIntentRow>(`SELECT publication_intents.*, accounts.handle FROM publication_intents
    LEFT JOIN accounts ON accounts.id=publication_intents.account_id
    ${input.status ? `WHERE publication_intents.status=${sqlString(input.status)}` : ""}
    ORDER BY publication_intents.requested_at ASC, publication_intents.id ASC
    LIMIT ${sqlNumber(Math.max(1, Math.min(500, input.limit || 100)))};`).map(publicationIntent);
}

export function getPublicationIntent(id: number): PublicationIntent | null {
  const row = rows<PublicationIntentRow>(`SELECT publication_intents.*, accounts.handle FROM publication_intents
    LEFT JOIN accounts ON accounts.id=publication_intents.account_id
    WHERE publication_intents.id=${sqlNumber(id)} LIMIT 1;`)[0];
  return row ? publicationIntent(row) : null;
}

export function createPublicationIntent(input: { draftId: number; accountId: number; idempotencyKey: string; text: string; mediaPath?: string; mediaHash?: string; now: number }): PublicationIntent {
  const draft = getDraft(input.draftId);
  const account = getAccounts().find((item) => item.id === input.accountId);
  if (!draft || !account) throw new Error("publication intent için draft ve hesap gerekli");
  const existing = rows<{ id: number }>(`SELECT id FROM publication_intents WHERE idempotency_key=${sqlString(input.idempotencyKey)} LIMIT 1;`)[0];
  if (existing) return getPublicationIntent(existing.id)!;
  exec(`INSERT INTO publication_intents (
      draft_id, account_id, status, idempotency_key, text, media_path, media_hash, requested_at, updated_at
    ) VALUES (
      ${sqlNumber(input.draftId)}, ${sqlNumber(input.accountId)}, 'pending_approval', ${sqlString(input.idempotencyKey)},
      ${sqlString(input.text.slice(0, 280))}, ${sqlString(input.mediaPath || "")}, ${sqlString(input.mediaHash || "")},
      ${sqlNumber(input.now)}, ${sqlNumber(input.now)}
    );`);
  const intent = rows<{ id: number }>(`SELECT id FROM publication_intents WHERE idempotency_key=${sqlString(input.idempotencyKey)} LIMIT 1;`)[0];
  if (!intent) throw new Error("publication intent oluşturulamadı");
  return getPublicationIntent(intent.id)!;
}

export function updatePublicationIntent(input: {
  id: number; status: PublicationIntentStatus; reason?: string; xuseQueueId?: string; receipt?: string; remoteUrl?: string;
  approvedAt?: number | null; dispatchedAt?: number | null; confirmedAt?: number | null; now: number;
}): PublicationIntent | null {
  const current = getPublicationIntent(input.id);
  if (!current) return null;
  exec(`UPDATE publication_intents SET status=${sqlString(input.status)}, reason=${sqlString(input.reason ?? current.reason)},
    xuse_queue_id=${sqlString(input.xuseQueueId ?? current.xuseQueueId)}, receipt=${sqlString(input.receipt ?? current.receipt)},
    remote_url=${sqlString(input.remoteUrl ?? current.remoteUrl)},
    approved_at=${input.approvedAt === undefined ? "approved_at" : input.approvedAt === null ? "NULL" : sqlNumber(input.approvedAt)},
    dispatched_at=${input.dispatchedAt === undefined ? "dispatched_at" : input.dispatchedAt === null ? "NULL" : sqlNumber(input.dispatchedAt)},
    confirmed_at=${input.confirmedAt === undefined ? "confirmed_at" : input.confirmedAt === null ? "NULL" : sqlNumber(input.confirmedAt)},
    updated_at=${sqlNumber(input.now)} WHERE id=${sqlNumber(input.id)};`);
  return getPublicationIntent(input.id);
}

export function syncIntentPublication(intentId: number, now: number): void {
  const intent = getPublicationIntent(intentId);
  if (!intent || intent.status !== "confirmed") return;
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
  if (!intent) return;
  const draft = getDraft(intent.draftId);
  const externalId = draft?.externalId || `intent:${intent.id}`;
  const attempt = rows<{ id: number }>(`SELECT id FROM publish_attempts
    WHERE post_external_id=${sqlString(externalId)} AND account_id=${sqlNumber(intent.accountId)}
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
  exec(`INSERT INTO drafts (batch_id, origin, prompt, provider, model, variant_mode, source_handle, source_url, source_score,
      external_id, account_id, format, text, status, gate_reason, created_at, updated_at)
    VALUES (${sqlString(input.batchId || "")}, ${sqlString(input.origin || "manual")},
      ${sqlString(input.prompt || "")}, ${sqlString(input.provider || "")}, ${sqlString(input.model || "")},
      ${sqlString(input.variantMode || "same_text")}, ${sqlString(input.sourceHandle || "")},
      ${sqlString(input.sourceUrl || "")}, ${Number.isFinite(input.sourceScore) ? input.sourceScore : 0},
      ${sqlString(input.externalId)}, ${input.accountId ? sqlNumber(input.accountId) : "NULL"},
      ${sqlString(input.format)}, ${sqlString(input.text)}, ${sqlString(input.status || "draft")},
      ${sqlString(input.gateReason || "")}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
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
  const accountSql = input.accountId === undefined ? "account_id" : input.accountId === null ? "NULL" : sqlNumber(input.accountId);
  exec(`UPDATE drafts SET account_id=${accountSql}, format=${sqlString(input.format ?? current.format)},
    text=${sqlString(input.text ?? current.text)}, status=${sqlString(input.status ?? current.status)},
    gate_reason=${sqlString(input.gateReason ?? current.gateReason)},
    source_handle=${sqlString(input.sourceHandle ?? current.sourceHandle)},
    source_url=${sqlString(input.sourceUrl ?? current.sourceUrl)}, updated_at=${sqlNumber(input.now)}
    WHERE id=${sqlNumber(input.id)};`);
  return getDraft(input.id);
}

export function deleteDraft(id: number): boolean {
  if (!getDraft(id)) return false;
  exec(`DELETE FROM automation_jobs WHERE draft_id=${sqlNumber(id)}; DELETE FROM drafts WHERE id=${sqlNumber(id)};`);
  return !getDraft(id);
}

export function getJobs(limit = 100): AutomationJob[] {
  return rows<{
    id: number;
    draft_id: number;
    account_id: number | null;
    handle: string | null;
    action: string;
    scheduled_at: number;
    status: string;
    receipt: string;
    reason: string;
    xuse_queue_id: string;
    xuse_status: string;
    xuse_checked_at: number;
    remote_url: string;
    reconciliation_status: string;
    attempts: number;
    created_at: number;
    updated_at: number;
  }>(`SELECT automation_jobs.id, draft_id, automation_jobs.account_id, accounts.handle,
      action, scheduled_at, automation_jobs.status, receipt, automation_jobs.reason,
      xuse_queue_id, xuse_status, xuse_checked_at, remote_url, reconciliation_status,
      attempts, automation_jobs.created_at, automation_jobs.updated_at
      FROM automation_jobs LEFT JOIN accounts ON accounts.id=automation_jobs.account_id
      ORDER BY scheduled_at ASC, automation_jobs.id DESC LIMIT ${sqlNumber(limit)};`).map((job) => ({
    id: job.id,
    draftId: job.draft_id,
    accountId: job.account_id,
    accountHandle: job.handle || "atanmamış",
    action: job.action,
    scheduledAt: job.scheduled_at,
    status: job.status,
    receipt: job.receipt,
    reason: job.reason,
    xuseQueueId: job.xuse_queue_id || "",
    xuseStatus: job.xuse_status || "",
    xuseCheckedAt: job.xuse_checked_at || 0,
    remoteUrl: job.remote_url || "",
    reconciliationStatus: job.reconciliation_status || "not_started",
    attempts: job.attempts,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }));
}

export function createJob(input: {
  draftId: number;
  accountId?: number | null;
  action: string;
  scheduledAt: number;
  now: number;
}): AutomationJob {
  const accountSql = input.accountId ? sqlNumber(input.accountId) : "NULL";
  const existing = rows<{ id: number }>(`SELECT id FROM automation_jobs
    WHERE draft_id=${sqlNumber(input.draftId)} AND account_id IS ${input.accountId ? "NOT NULL" : "NULL"}
      ${input.accountId ? `AND account_id=${accountSql}` : ""}
      AND action=${sqlString(input.action)}
      AND status IN ('queued','running','submitted','pending_reconciliation')
    ORDER BY id DESC LIMIT 1;`)[0];
  if (existing) {
    const current = getJobs(500).find((job) => job.id === existing.id);
    if (current) return current;
  }
  exec(`INSERT INTO automation_jobs (draft_id, account_id, action, scheduled_at, created_at, updated_at)
    VALUES (${sqlNumber(input.draftId)}, ${accountSql},
      ${sqlString(input.action)}, ${sqlNumber(input.scheduledAt)}, ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
  const result = getJobs(500).sort((left, right) => right.id - left.id)[0];
  if (!result) throw new Error("job could not be created");
  return result;
}

export function updateJob(input: {
  id: number;
  status?: string;
  receipt?: string;
  reason?: string;
  xuseQueueId?: string;
  xuseStatus?: string;
  xuseCheckedAt?: number;
  remoteUrl?: string;
  reconciliationStatus?: string;
  attempts?: number;
  now: number;
}): AutomationJob | null {
  const current = getJobs(200).find((job) => job.id === input.id);
  if (!current) return null;
  exec(`UPDATE automation_jobs SET status=${sqlString(input.status ?? current.status)},
    receipt=${sqlString(input.receipt ?? current.receipt)}, reason=${sqlString(input.reason ?? current.reason)},
    xuse_queue_id=${sqlString(input.xuseQueueId ?? current.xuseQueueId)},
    xuse_status=${sqlString(input.xuseStatus ?? current.xuseStatus)}, xuse_checked_at=${sqlNumber(input.xuseCheckedAt ?? current.xuseCheckedAt)},
    remote_url=${sqlString(input.remoteUrl ?? current.remoteUrl)},
    reconciliation_status=${sqlString(input.reconciliationStatus ?? current.reconciliationStatus)},
    attempts=${sqlNumber(input.attempts ?? current.attempts)}, updated_at=${sqlNumber(input.now)}
    WHERE id=${sqlNumber(input.id)};`);
  return getJobs(200).find((job) => job.id === input.id) || null;
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
  exec(`INSERT INTO draft_batches
    (id, prompt, format, variant_mode, account_ids_json, provider, model, status, created_at, updated_at)
    VALUES (${sqlString(id)}, ${sqlString(input.prompt)}, ${sqlString(input.format)},
      ${sqlString(input.variantMode)}, ${sqlString(JSON.stringify(input.accountIds))},
      ${sqlString(input.provider)}, ${sqlString(input.model)}, ${sqlString(input.status || "draft")},
      ${sqlNumber(input.now)}, ${sqlNumber(input.now)});`);
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
      created_at, updated_at FROM draft_batches WHERE id=${sqlString(id)} LIMIT 1;`)[0];
  return row ? batchFromRow(row) : null;
}

export function updateDraftBatch(id: string, status: string, now: number): DraftBatch | null {
  exec(`UPDATE draft_batches SET status=${sqlString(status)}, updated_at=${sqlNumber(now)} WHERE id=${sqlString(id)};`);
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
  metadata?: Record<string, unknown>;
  now: number;
}): UsageEvent {
  exec(`INSERT INTO usage_events
    (kind, provider, model, units, estimated_usd, metadata_json, created_at)
    VALUES (${sqlString(input.kind)}, ${sqlString(input.provider)}, ${sqlString(input.model)},
      ${sqlNumber(input.units || 1)}, ${Number.isFinite(input.estimatedUsd) ? input.estimatedUsd : 0},
      ${sqlString(JSON.stringify(input.metadata || {}))}, ${sqlNumber(input.now)});`);
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
  byProvider: Array<{ provider: string; events: number; units: number; estimatedUsd: number }>;
  byModel: Array<{ provider: string; model: string; events: number; units: number; estimatedUsd: number }>;
  byKind: Array<{ kind: string; events: number; units: number; estimatedUsd: number }>;
} {
  const total = rows<{ events: number; units: number; estimatedUsd: number }>(`SELECT COUNT(*) as events,
      COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_usd), 0) as estimatedUsd
      FROM usage_events WHERE created_at >= ${sqlNumber(since)};`)[0] || { events: 0, units: 0, estimatedUsd: 0 };
  return {
    events: total.events,
    units: total.units,
    estimatedUsd: total.estimatedUsd,
    byProvider: rows<{ provider: string; events: number; units: number; estimatedUsd: number }>(`SELECT provider,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_usd), 0) as estimatedUsd
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} GROUP BY provider ORDER BY units DESC;`),
    byModel: rows<{ provider: string; model: string; events: number; units: number; estimatedUsd: number }>(`SELECT provider, model,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_usd), 0) as estimatedUsd
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} GROUP BY provider, model ORDER BY units DESC;`),
    byKind: rows<{ kind: string; events: number; units: number; estimatedUsd: number }>(`SELECT kind,
      COUNT(*) as events, COALESCE(SUM(units), 0) as units, COALESCE(SUM(estimated_usd), 0) as estimatedUsd
      FROM usage_events WHERE created_at >= ${sqlNumber(since)} GROUP BY kind ORDER BY units DESC;`),
  };
}

export function getSecretCiphertext(name: string): { provider: string; ciphertext: string; updatedAt: number } | null {
  const secret = rows<{ provider: string; ciphertext: string; updated_at: number }>(
    `SELECT provider, ciphertext, updated_at FROM secrets WHERE name=${sqlString(name)} LIMIT 1;`,
  )[0];
  return secret ? { provider: secret.provider, ciphertext: secret.ciphertext, updatedAt: secret.updated_at } : null;
}

export function saveSecretCiphertext(name: string, provider: string, ciphertext: string, now: number): void {
  exec(`INSERT INTO secrets (name, provider, ciphertext, updated_at)
    VALUES (${sqlString(name)}, ${sqlString(provider)}, ${sqlString(ciphertext)}, ${sqlNumber(now)})
    ON CONFLICT(name) DO UPDATE SET provider=excluded.provider, ciphertext=excluded.ciphertext, updated_at=excluded.updated_at;`);
}

export function deleteSecret(name: string): void {
  exec(`DELETE FROM secrets WHERE name=${sqlString(name)};`);
}

export function getSecretMetas(mask: (name: string) => string): SecretMeta[] {
  return rows<{ name: string; provider: string; updated_at: number }>(
    "SELECT name, provider, updated_at FROM secrets ORDER BY name;",
  ).map((secret) => ({
    name: secret.name,
    provider: secret.provider,
    configured: true,
    masked: mask(secret.name),
    updatedAt: secret.updated_at,
  }));
}

export function getSetting(name: string, fallback = ""): string {
  return rows<{ value: string }>(`SELECT value FROM app_settings WHERE name=${sqlString(name)} LIMIT 1;`)[0]?.value || fallback;
}

export function setSetting(name: string, value: string, now: number): void {
  exec(`INSERT INTO app_settings (name, value, updated_at)
    VALUES (${sqlString(name)}, ${sqlString(value)}, ${sqlNumber(now)})
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
  const result = rows<{ drafts: number; queued: number; confirmed: number; blocked: number; failed: number; feedback: number }>(`SELECT
    (SELECT COUNT(*) FROM drafts) as drafts,
    (SELECT COUNT(*) FROM automation_jobs WHERE status IN ('queued','running','submitted','pending_reconciliation')) as queued,
    (SELECT COUNT(*) FROM automation_jobs WHERE status='confirmed') as confirmed,
    (SELECT COUNT(*) FROM automation_jobs WHERE status='blocked') as blocked,
    (SELECT COUNT(*) FROM automation_jobs WHERE status='failed') as failed,
    (SELECT COUNT(*) FROM feedback_snapshots) as feedback;`)[0];
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
      WHERE status='confirmed' AND account_id IS NOT NULL AND post_external_id<>''
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
    WHERE attempt.status='confirmed' ORDER BY feedback.views DESC, feedback.captured_at DESC LIMIT 100;
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
