import type { Account, AccountCategoryConfig } from "./db";

export type FormatEvidence = { samples: number | null; engagementRate: number | null };
export type OfficialTimeOutcome = { publishedAt: number; views: number | null };
export type QuietHours = { startMinute: number; endMinute: number; timeZone: string };
export type AccountFitInput = {
  account: Account;
  category: string;
  categoryConfig?: AccountCategoryConfig;
  topicFatigue: number | null;
  sourceFatigue: number | null;
  budgetAvailable: boolean | null;
  formatEvidence: Record<string, FormatEvidence>;
  capabilities: readonly string[];
  sourceRights: "cleared" | "unknown" | "prohibited";
  replySummoned: boolean;
  duplicate: boolean;
  now: number;
  officialTimeOutcomes: OfficialTimeOutcome[] | null;
};

export type AccountFitDecision = {
  version: "account-fit-v1";
  score: number | null;
  confidenceBasis: "configured_category_voice_and_history" | "configured_category_and_voice" | "configured_category_only" | "insufficient_configuration";
  reasons: string[];
  action: "post" | "repost" | "reply" | null;
  format: "post" | "repost" | "reply" | null;
  formatReasons: string[];
  blocked: Record<string, string>;
  sourceFatigue: { count: number | null; basis: "confirmed_publication_policy_history_24h" | "unavailable" };
  timing: { eligibility: "configured_window_open" | "quiet_window_active" | "quiet_hours_unconfigured" | "quiet_hours_invalid"; quietHoursReason: string; publishWindowOpen: boolean | null; recommendedLocalHour: number | null; bestTimeReason: string; bestTimeSamples: number };
  riskTier: "unknown";
  publishConsent: false;
};

/** Deterministic account-relative suitability; score is a ranking signal, never a probability. */
export function chooseAccountFit(input: AccountFitInput): AccountFitDecision {
  const config = input.categoryConfig;
  const voice = input.account.styleProfile.voice;
  const hasVoice = Boolean(voice && typeof voice === "object");
  const configuredCategory = Boolean(config?.enabled);
  const categoryScore = configuredCategory ? Math.max(0, Math.min(100, config!.weight * 20)) : null;
  const voiceScore = hasVoice ? 70 : null;
  const fatigueScore = input.topicFatigue === null ? null : Math.max(0, 100 - Math.min(100, input.topicFatigue * 25));
  const sourceFatigueScore = input.sourceFatigue === null ? null : Math.max(0, 100 - Math.min(100, input.sourceFatigue * 25));
  const components = [categoryScore, voiceScore, fatigueScore, sourceFatigueScore].filter((value): value is number => value !== null);
  const score = components.length ? Math.round(components.reduce((sum, value) => sum + value, 0) / components.length) : null;
  const reasons = [
    configuredCategory ? `category_weight:${config!.weight}` : "category_not_configured",
    hasVoice ? "account_voice_profile_available" : "account_voice_profile_unavailable",
    input.topicFatigue === null ? "topic_fatigue_unavailable" : `recent_category_publications:${input.topicFatigue}`,
    input.sourceFatigue === null ? "source_fatigue_unavailable" : `recent_confirmed_source_publications:${input.sourceFatigue}`,
  ];
  const formatReasons: string[] = [];
  const blocked: Record<string, string> = {};
  const allowed: string[] = [];
  if (input.budgetAvailable === false) {
    blocked.post = "daily_budget_exhausted";
    blocked.repost = "daily_budget_exhausted";
    blocked.reply = "daily_budget_exhausted";
  } else if (input.duplicate) blocked.post = "duplicate_or_cluster_already_published";
  else if (input.capabilities.includes("post")) allowed.push("post"); else blocked.post = "capability_unverified";
  if (input.budgetAvailable !== false) {
    if (!input.capabilities.includes("repost")) blocked.repost = "capability_unverified";
    else if (input.sourceRights !== "cleared") blocked.repost = "source_rights_not_cleared";
    else if (input.duplicate) blocked.repost = "duplicate_or_cluster_already_published";
    else allowed.push("repost");
    if (!input.capabilities.includes("reply")) blocked.reply = "capability_unverified";
    else if (!input.replySummoned) blocked.reply = "official_reply_summon_missing";
    else allowed.push("reply");
  }
  blocked.quote = "quote_entitlement_unknown";
  const format = (Object.entries(input.formatEvidence)
    .filter(([action, evidence]) => allowed.includes(action) && evidence.samples !== null && evidence.samples >= 5 && evidence.engagementRate !== null)
    .sort((a, b) => (b[1].engagementRate! - a[1].engagementRate!) || a[0].localeCompare(b[0]))[0]?.[0]
    || (allowed.includes("post") ? "post" : allowed[0] || null)) as AccountFitDecision["format"];
  if (format) {
    const history = input.formatEvidence[format];
    formatReasons.push(history?.samples === null ? "format_history_unavailable_fallback" : history?.samples !== undefined && history.samples >= 5 ? `account_format_history:${history.samples}_samples` : "safe_capability_fallback");
  } else formatReasons.push("no_capability_safe_format");
  const confidenceBasis = input.topicFatigue !== null && Object.values(input.formatEvidence).some((item) => item.samples !== null && item.samples >= 5)
    ? "configured_category_voice_and_history"
    : configuredCategory && hasVoice ? "configured_category_and_voice"
      : configuredCategory ? "configured_category_only" : "insufficient_configuration";
  const scheduleState = resolveQuietHours(input.account.styleProfile, config?.styleOverride);
  const schedule = scheduleState.config;
  const localHour = schedule ? hourAt(input.now, schedule.timeZone) : null;
  const invalidTiming = scheduleState.invalid || Boolean(schedule && localHour === null);
  const isQuiet = schedule && localHour !== null ? isQuietHour(localHour * 60 + minuteAt(input.now, schedule.timeZone), schedule) : false;
  const bestTime = recommendBestHour(input.officialTimeOutcomes, schedule);
  const timing = {
    eligibility: invalidTiming ? "quiet_hours_invalid" as const : !schedule ? "quiet_hours_unconfigured" as const : isQuiet ? "quiet_window_active" as const : "configured_window_open" as const,
    quietHoursReason: invalidTiming ? "quiet_hours_invalid_fail_closed" : !schedule ? "quiet_hours_unconfigured" : isQuiet ? "configured_quiet_window_active" : "configured_window_open",
    publishWindowOpen: invalidTiming ? false : schedule ? !isQuiet : null,
    recommendedLocalHour: bestTime.hour,
    bestTimeReason: bestTime.reason,
    bestTimeSamples: bestTime.samples,
  };
  return {
    version: "account-fit-v1", score, confidenceBasis, reasons, action: format, format, formatReasons, blocked,
    sourceFatigue: { count: input.sourceFatigue, basis: input.sourceFatigue === null ? "unavailable" : "confirmed_publication_policy_history_24h" },
    timing, riskTier: "unknown", publishConsent: false,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clockMinute(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function quietHoursConfiguration(accountStyle: Record<string, unknown>, categoryStyle?: Record<string, unknown>): QuietHours | null {
  return resolveQuietHours(accountStyle, categoryStyle).config;
}

function resolveQuietHours(accountStyle: Record<string, unknown>, categoryStyle?: Record<string, unknown>): { config: QuietHours | null; invalid: boolean } {
  const schedule = record(categoryStyle?.postingSchedule);
  const fallback = record(accountStyle.postingSchedule);
  const hasCategoryConfig = Object.hasOwn(record(categoryStyle), "postingSchedule");
  const hasAccountConfig = Object.hasOwn(accountStyle, "postingSchedule");
  const hasSchedule = hasCategoryConfig || hasAccountConfig;
  const config = Object.keys(schedule).length ? schedule : fallback;
  const quiet = record(config.quietHours);
  const startMinute = clockMinute(quiet.start);
  const endMinute = clockMinute(quiet.end);
  const timeZone = quiet.timeZone;
  if (!hasSchedule) return { config: null, invalid: false };
  if (startMinute === null || endMinute === null || startMinute === endMinute || typeof timeZone !== "string" || !timeZone.trim()) return { config: null, invalid: true };
  try { new Intl.DateTimeFormat("en", { timeZone }).format(0); } catch { return { config: null, invalid: true }; }
  return { config: { startMinute, endMinute, timeZone }, invalid: false };
}

function partsAt(timestamp: number, timeZone: string): { hour: number; minute: number } | null {
  if (!Number.isSafeInteger(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(timestamp * 1000);
    return { hour: Number(parts.find((part) => part.type === "hour")?.value), minute: Number(parts.find((part) => part.type === "minute")?.value) };
  } catch { return null; }
}

function hourAt(timestamp: number, timeZone: string): number | null { return partsAt(timestamp, timeZone)?.hour ?? null; }
function minuteAt(timestamp: number, timeZone: string): number { return partsAt(timestamp, timeZone)?.minute ?? 0; }

export function isQuietHour(minuteOfDay: number, quiet: Pick<QuietHours, "startMinute" | "endMinute">): boolean {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 1440) return true;
  return quiet.startMinute < quiet.endMinute
    ? minuteOfDay >= quiet.startMinute && minuteOfDay < quiet.endMinute
    : minuteOfDay >= quiet.startMinute || minuteOfDay < quiet.endMinute;
}

function recommendBestHour(outcomes: OfficialTimeOutcome[] | null, quiet: QuietHours | null): { hour: number | null; reason: string; samples: number } {
  if (outcomes === null) return { hour: null, reason: "official_outcome_history_unavailable", samples: 0 };
  const byHour = new Map<number, number[]>();
  for (const outcome of outcomes) {
    if (outcome.views === null || !Number.isFinite(outcome.views) || outcome.views < 0) continue;
    const time = quiet ? partsAt(outcome.publishedAt, quiet.timeZone) : null;
    if (!time || (quiet && isQuietHour(time.hour * 60 + time.minute, quiet))) continue;
    const values = byHour.get(time.hour) || [];
    values.push(outcome.views);
    byHour.set(time.hour, values);
  }
  const candidates = [...byHour.entries()].filter(([, values]) => values.length >= 5)
    .map(([hour, values]) => ({ hour, samples: values.length, median: median(values) }))
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0) || b.samples - a.samples || a.hour - b.hour);
  const best = candidates[0];
  if (!best) return { hour: null, reason: outcomes.length ? "insufficient_official_outcome_samples" : "no_official_outcome_history", samples: 0 };
  return { hour: best.hour, reason: "best_confirmed_official_views_by_local_hour", samples: best.samples };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
