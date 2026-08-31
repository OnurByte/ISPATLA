import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getSetting,
  getCategories,
  getStoredSources,
  saveSourceCategoryConfig,
  setSetting,
  upsertSource,
  type SourceConfig,
  type SourceProfile,
} from "./db";
import { resolveIdeology } from "./ideologies";

type RawSource = {
  handle?: unknown;
  name?: unknown;
  enabled?: unknown;
  maxPosts?: unknown;
  rightsStatus?: unknown;
  profile?: unknown;
};

type SourceFile = { sources?: RawSource[] };

export type DiscoveryEvidence = {
  handle: string;
  weight: number;
  parentHandles: string[];
};

export function sourceConfigPath(): string {
  return process.env.ISPATLA_SOURCES || join(/* turbopackIgnore: true */ process.cwd(), "config", "sources.json");
}

export function asHandle(value: unknown): string | null {
  const handle = String(value || "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

export function asNiche(value: unknown, fallback = ""): string {
  const niche = String(value ?? fallback).trim().replace(/\s+/g, " ");
  return niche.slice(0, 180);
}

export function asTone(value: unknown, fallback = ""): string {
  const tone = String(value ?? fallback).trim().replace(/\s+/g, " ");
  return tone.slice(0, 140);
}

export function asIdeology(value: unknown, fallback: SourceProfile["ideology"] = "belirsiz"): SourceProfile["ideology"] {
  return resolveIdeology(value) || resolveIdeology(fallback) || "belirsiz";
}

export function asIdeologyTags(value: unknown, fallback: SourceProfile["ideologyTags"] = []): SourceProfile["ideologyTags"] {
  const values = Array.isArray(value) ? value : String(value ?? fallback.join(",")).split(",");
  return [...new Set(values.map(resolveIdeology).filter((tag): tag is string => Boolean(tag && tag !== "belirsiz")))].slice(0, 6);
}

export function asTopics(value: unknown, fallback: string[] = []): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  const topics = values
    .map((topic) => String(topic).trim().replace(/\s+/g, " ").slice(0, 60))
    .filter(Boolean);
  return [...new Set(topics.length ? topics : fallback)].slice(0, 8);
}

function asRightsStatus(value: unknown): SourceConfig["rightsStatus"] {
  return value === "cleared" || value === "prohibited" ? value : "unknown";
}

function readConfiguredSources(): SourceConfig[] {
  const path = sourceConfigPath();
  if (!existsSync(path)) return [];
  try {
    const file = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")) as SourceFile;
    return (Array.isArray(file.sources) ? file.sources : []).flatMap((raw) => {
      const handle = asHandle(raw.handle);
      if (!handle) return [];
      return [{
        handle,
        name: String(raw.name || handle),
        enabled: raw.enabled !== false,
        maxPosts: Math.min(50, Math.max(1, Number(raw.maxPosts || 20))),
        rightsStatus: asRightsStatus(raw.rightsStatus),
        profile: raw.profile && typeof raw.profile === "object"
          ? raw.profile as SourceProfile
          : {},
      } satisfies SourceConfig];
    });
  } catch {
    return [];
  }
}

export function bootstrapSources(now = Math.floor(Date.now() / 1000)): number {
  if (getSetting("sources_seed_v1", "") === "done") {
    backfillSeedProfiles(now);
    return 0;
  }
  const stored = new Map(getStoredSources().map((source) => [source.handle, source]));
  const seedHandles = new Set(readConfiguredSources().map((source) => source.handle));
  let inserted = 0;
  for (const seed of readConfiguredSources()) {
    const current = stored.get(seed.handle);
    if (current) {
      if (!current.profile.origin) {
        upsertSource({ ...current, profile: { ...current.profile, ...seed.profile, origin: "seed" } }, now);
      }
      continue;
    }
    upsertSource(seed, now);
    inserted += 1;
  }
  for (const current of stored.values()) {
    if (current.profile.origin || seedHandles.has(current.handle)) continue;
    upsertSource({
      ...current,
      profile: { ...current.profile, origin: "manual", status: "active", pinned: true },
    }, now);
  }
  bootstrapCategorySeeds(now);
  setSetting("sources_seed_v1", "done", now);
  backfillSeedProfiles(now);
  return inserted;
}

function bootstrapCategorySeeds(now: number): void {
  const sources = new Map(getStoredSources().map((source) => [source.handle, source]));
  for (const category of getCategories()) {
    for (const value of category.seedHandles) {
      const handle = asHandle(value);
      if (!handle) continue;
      if (!sources.has(handle)) {
        const source: SourceConfig = {
          handle, name: handle, enabled: true, maxPosts: 20, rightsStatus: "unknown",
          profile: { origin: "seed", status: "active", pinned: false },
        };
        upsertSource(source, now);
        sources.set(handle, source);
      }
      saveSourceCategoryConfig({ sourceHandle: handle, categoryId: category.id, monitoringTier: "B", discoveryWeight: 1, categoryReputation: null, enabled: true, lastEvidenceAt: now });
    }
  }
}

function backfillSeedProfiles(now: number): void {
  if (getSetting("sources_political_v2", "") === "done") return;
  const configured = new Map(readConfiguredSources().map((source) => [source.handle, source]));
  for (const current of getStoredSources()) {
    const seed = configured.get(current.handle);
    const hasCurrentIdeology = Boolean(current.profile.ideology?.trim());
    if (current.profile.origin !== "seed" || hasCurrentIdeology || !seed?.profile.ideology) continue;
    upsertSource({
      ...current,
      profile: {
        ...current.profile,
        niche: seed.profile.niche,
        tone: seed.profile.tone,
        topics: seed.profile.topics,
        ideology: seed.profile.ideology,
        ideologyTags: seed.profile.ideologyTags,
        ideologyConfidence: seed.profile.ideologyConfidence,
        ideologyBasis: seed.profile.ideologyBasis,
        ideologyReason: seed.profile.ideologyReason,
      },
    }, now);
  }
  setSetting("sources_political_v2", "done", now);
}

export function loadSources(): SourceConfig[] {
  bootstrapSources();
  const stored = getStoredSources();
  return (stored.length > 0 ? stored : readConfiguredSources()).map((source) => ({
    ...source,
    profile: { ...source.profile, ideology: asIdeology(source.profile.ideology), ideologyTags: asIdeologyTags(source.profile.ideologyTags) },
  }));
}

export function enabledSources(): SourceConfig[] {
  return loadSources().filter((source) => source.enabled && source.profile.status !== "candidate");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function authorHandle(value: unknown): string | null {
  const object = record(value);
  return asHandle(object.screen_name || object.username || object.handle);
}

export function extractDiscoveryEvidence(parentHandle: string, value: unknown): DiscoveryEvidence[] {
  const parent = asHandle(parentHandle);
  const post = record(value);
  const canonical = record(post.discovery);
  const found = new Map<string, number>();
  const add = (handle: string | null, weight: number) => {
    if (!handle || handle === parent) return;
    found.set(handle, (found.get(handle) || 0) + weight);
  };

  add(asHandle(canonical.quoteAuthor) || authorHandle(record(post.quote).author), 3);
  add(asHandle(canonical.replyTo) || authorHandle(post.replying_to), 2);

  if (Array.isArray(canonical.mentions)) {
    for (const mention of canonical.mentions) add(asHandle(mention), 1);
  }

  const rawText = record(post.raw_text);
  const facets = Array.isArray(rawText.facets) ? rawText.facets : [];
  for (const facetValue of facets) {
    const facet = record(facetValue);
    if (facet.type !== "mention") continue;
    add(asHandle(facet.original || facet.display || facet.replacement), 1);
  }

  return [...found].map(([handle, weight]) => ({
    handle,
    weight,
    parentHandles: parent ? [parent] : [],
  }));
}

export function mergeEvidence(
  profile: SourceProfile,
  evidence: DiscoveryEvidence,
  now: number,
): SourceProfile {
  const parents = new Set([...(profile.parentHandles || []), ...evidence.parentHandles]);
  const elapsed = Math.max(0, now - Number(profile.lastEvidenceAt || now));
  const decayedWeight = Math.max(0, Number(profile.evidenceWeight || 0)) * Math.pow(0.5, elapsed / (30 * 86400));
  return {
    ...profile,
    origin: profile.origin || "discovered",
    status: profile.status || "candidate",
    pinned: profile.pinned === true,
    parentHandles: [...parents].sort(),
    // ponytail: profile stores aggregate evidence only; add a persistent edge ledger if per-parent rate limits need audits.
    evidenceWeight: decayedWeight + Math.min(3, Math.max(0, evidence.weight)),
    lastEvidenceAt: now,
  };
}

export function sourceDueForScoring(profile: SourceProfile, now: number): boolean {
  const eligible = profile.status === "active" || (Number(profile.evidenceWeight || 0) >= 3 && new Set(profile.parentHandles || []).size >= 2);
  return eligible && now - Number(profile.lastScoredAt || 0) >= 86400;
}

export function nextSourceState(
  profile: SourceProfile,
  score: number,
  confidence: number,
): { status: "candidate" | "active"; enabled: boolean; lowScoreStreak: number; deleteReady: boolean } {
  const status = profile.status === "active" ? "active" : "candidate";
  const lowScoreStreak = score < 40 ? Number(profile.lowScoreStreak || 0) + 1 : 0;
  if (score >= 70 && confidence >= 70 && Number(profile.evidenceWeight || 0) >= 3 && new Set(profile.parentHandles || []).size >= 2) {
    return { status: "active", enabled: true, lowScoreStreak: 0, deleteReady: false };
  }
  return {
    status,
    enabled: status === "active",
    lowScoreStreak,
    // ponytail: automatic deletion stays off until slop/no-content evidence is persisted across scans.
    deleteReady: false,
  };
}
