/**
 * Jev relevance scoring client (Faz B1).
 *
 * Jev is an N x M *reranker*: it scores candidates the local pipeline already
 * selected against a small set of facet questions. It never generates text, it
 * never widens eligibility and it never writes a decision. Callers keep their
 * local ranking and use Jev only as an extra signal.
 *
 * PUBLIC API (stable — B2/B3 build on this):
 *   type JevMode = "off" | "shadow" | "on"
 *   type JevDiagnostic                        fixed union, see JEV_DIAGNOSTICS
 *   type JevCandidate = { id, title, statement, scope, domains[] }
 *   type JevQuestion  = { index, text }       one facet question
 *   type JevConfig / JevSettings              resolved app_settings snapshot
 *   type JevResult    = { mode, scores, facetScores, degraded, diagnostics,
 *                         cacheHit, usage, latencyMs, requestHash, reportedModel?,
 *                         confidenceProvenance }
 *
 *   jevMode(): JevMode
 *   jevConfigured(): boolean
 *   getJevSettings(): JevSettings
 *   jevScore(args: { query, facets, candidates, scope? }): Promise<JevResult>
 *   jevToPercent(score: number): number                     0..2 -> 0..100
 *   recordJevScores(args: { subjectKind, entries, result }): number
 *   setJevTransportForTests(transport: JevTransport | null): void
 *
 * INVARIANTS:
 *   - jevScore NEVER throws and NEVER retries. Every failure resolves to
 *     { degraded: true, scores: {} } carrying exactly one diagnostic code.
 *   - mode "off" short circuits before key, network and cache are touched.
 *   - No provider response body, URL, header or credential ever reaches a
 *     diagnostic, a log line or the database.
 *   - degraded is not "no evidence" and not "score 0"; callers fall back to the
 *     local path unchanged.
 *   - scores[id] aggregates facetScores as the maximum across facets.
 *   - confidence is counted (confidenceProvenance) and never read for selection.
 */

import { createHash } from "node:crypto";
import {
  getJevCacheEntry,
  getSetting,
  recordJevScoreRows,
  recordUsageEvent,
  saveJevCacheEntry,
  type JevScoreEntry,
} from "./db";
import { isAllowedJevEndpoint } from "./security";
import { secretOrEnv } from "./vault";

export const JEV_MODES = ["off", "shadow", "on"] as const;
export type JevMode = (typeof JEV_MODES)[number];

export const JEV_PROVIDERS = ["typesafe", "vercel"] as const;
export type JevProvider = (typeof JEV_PROVIDERS)[number];

export const JEV_DIAGNOSTICS = [
  "disabled",
  "http_unauthorized",
  "http_forbidden",
  "http_rate_limited",
  "http_server_error",
  "http_error",
  "deadline_exceeded",
  "config_invalid",
  "endpoint_invalid",
  "payload_invalid",
  "budget_exceeded",
  "answers_invalid",
  "credentials_missing",
  "capacity_exceeded",
  "redirect_rejected",
  "source_changed_during_evaluation",
  "response_too_large",
  "request_failed",
] as const;
export type JevDiagnostic = (typeof JEV_DIAGNOSTICS)[number];

export const JEV_PURPOSE = "relevance" as const;
export const JEV_RUBRIC_VERSION = "relevance-v1";
export const JEV_CACHE_SCHEMA = 1;

export const JEV_DEFAULT_MODEL = "jev-1.13.0";
export const JEV_DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const JEV_DEFAULT_TIMEOUT_MS = 3000;
export const JEV_MIN_TIMEOUT_MS = 500;
export const JEV_MAX_TIMEOUT_MS = 10_000;
/** Alias models (jev-latest) may move under us, so their cache window is short. */
export const JEV_ALIAS_CACHE_TTL_SECONDS = 300;
/** A pinned version (jev-1.13.0) is immutable, so its answers keep for an hour. */
export const JEV_PINNED_CACHE_TTL_SECONDS = 3600;
export const JEV_DEFAULT_CACHE_TTL_SECONDS = JEV_ALIAS_CACHE_TTL_SECONDS;
export const JEV_MAX_CANDIDATES = 32;
export const JEV_MAX_QUESTIONS = 96;
export const JEV_MAX_INPUT_CHARS = 24_000;
export const JEV_MAX_FACETS = 3;
export const JEV_MAX_INFLIGHT = 3;
export const JEV_MAX_WAITERS = 16;
export const JEV_MAX_RESPONSE_BYTES = 1024 * 1024;
/** Observed cost of one successful live call (jev-context/02, memory note 09-19). */
export const JEV_ESTIMATED_USD = 0.036;

const JEV_MODE_SETTING = "jev_mode";
const JEV_MODEL_SETTING = "jev_model";
const JEV_PROVIDER_SETTING = "jev_provider";
const JEV_BASE_URL_SETTING = "jev_base_url";
const JEV_TIMEOUT_SETTING = "jev_timeout_ms";
const JEV_CACHE_TTL_SETTING = "jev_cache_ttl_seconds";

const STRICT_PROBABILITY_TOLERANCE = 0.001;
/** Vercel rounds probabilities to two decimals; 3 terms x 0.005 rounding slack. */
const QUANTIZED_PROBABILITY_TOLERANCE = 0.02;
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/** One facet question. `index` is the j in the `f<j>_c<i>` answer key. */
export type JevQuestion = { index: number; text: string };

export type JevCandidate = {
  id: string;
  title: string;
  statement: string;
  scope: string;
  domains: string[];
};

export type JevUsage = { input_tokens?: number; output_tokens?: number };

/**
 * How many answers carried a usable `confidence` field. Counted for calibration
 * only: `usedForSelection` is a constant false because confidence is never a
 * permission (jev-context/02, "confidence SEÇİM İÇİN KULLANILMAZ").
 */
export type JevConfidenceProvenance = { present: number; missing: number; usedForSelection: false };

export function emptyConfidenceProvenance(): JevConfidenceProvenance {
  return { present: 0, missing: 0, usedForSelection: false };
}

export type JevSettings = {
  mode: JevMode;
  model: string;
  provider: JevProvider;
  baseUrl: string;
  timeoutMs: number;
  cacheTtlSeconds: number;
};

export type JevConfig = JevSettings & {
  endpoint: string;
  rubricVersion: string;
  purpose: typeof JEV_PURPOSE;
  maxCandidates: number;
  maxQuestions: number;
  maxInputChars: number;
  maxInflight: number;
};

export type JevResult = {
  mode: JevMode;
  scores: Record<string, number>;
  facetScores: Record<string, Record<string, number>>;
  degraded: boolean;
  diagnostics: JevDiagnostic[];
  cacheHit: boolean;
  usage: JevUsage;
  latencyMs: number;
  requestHash: string;
  reportedModel?: string;
  confidenceProvenance: JevConfidenceProvenance;
};

export type JevTransport = (
  request: { url: string; body: string; headers: Record<string, string> },
  signal: AbortSignal,
) => Promise<{ status: number; text: string }>;

/** The single built-in rubric. Callers never inject instructions or criteria. */
const RELEVANCE_RUBRIC = {
  instructions:
    "Score how directly the candidate matches the facet question (a content category or an account brief). Judge only the supplied candidate fields; ignore writing style, popularity, recency and how much you like the candidate. A candidate that merely shares vocabulary with the facet is not a match.",
  criteria: [
    "0 - Unrelated: the candidate does not address the facet question at all.",
    "1 - Partial: the candidate touches the facet indirectly, in passing, or only for one of several subjects.",
    "2 - Direct: the candidate is squarely about the facet question.",
  ] as [string, string, string],
};

// --- transport -------------------------------------------------------------

class JevFailure extends Error {
  constructor(readonly code: JevDiagnostic) {
    super(code);
    this.name = "JevFailure";
  }
}

const defaultTransport: JevTransport = async (request, signal) => {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new JevFailure(isRedirectError(error) ? "redirect_rejected" : "request_failed");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > JEV_MAX_RESPONSE_BYTES) {
    throw new JevFailure("response_too_large");
  }
  const text = await readCapped(response);
  return { status: response.status, text };
};

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > JEV_MAX_RESPONSE_BYTES) throw new JevFailure("response_too_large");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

let transportOverride: JevTransport | null = null;

/** Tests inject a fake transport; production always resolves to fetch. */
export function setJevTransportForTests(transport: JevTransport | null): void {
  transportOverride = transport;
}

function transport(): JevTransport {
  return transportOverride || defaultTransport;
}

function isAbortError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "AbortError" || name === "TimeoutError";
}

function isRedirectError(error: unknown): boolean {
  return error instanceof Error && /redirect/i.test(error.message);
}

// --- settings --------------------------------------------------------------

function isMode(value: string): value is JevMode {
  return (JEV_MODES as readonly string[]).includes(value);
}

function isProvider(value: string): value is JevProvider {
  return (JEV_PROVIDERS as readonly string[]).includes(value);
}

function setting(name: string, fallback: string): string {
  try {
    return getSetting(name, fallback);
  } catch {
    return fallback;
  }
}

/**
 * A model name is treated as an alias when it says "latest" or carries no version
 * digit at all; an alias can change under a cached answer, so it gets the short
 * window. Anything else looks pinned. An explicit `jev_cache_ttl_seconds` setting
 * always wins over both.
 */
export function isAliasModel(model: string): boolean {
  const name = String(model || "").trim().toLowerCase();
  if (!name) return true;
  return name.includes("latest") || !/\d/.test(name);
}

export function defaultCacheTtlSeconds(model: string): number {
  return isAliasModel(model) ? JEV_ALIAS_CACHE_TTL_SECONDS : JEV_PINNED_CACHE_TTL_SECONDS;
}

export function getJevSettings(): JevSettings {
  const stored = setting(JEV_MODE_SETTING, "").trim();
  const environment = String(process.env.ISPATLA_JEV_MODE || "").trim();
  const candidate = stored || environment;
  const timeout = Number(setting(JEV_TIMEOUT_SETTING, String(JEV_DEFAULT_TIMEOUT_MS)));
  const provider = setting(JEV_PROVIDER_SETTING, "typesafe").trim();
  const model = setting(JEV_MODEL_SETTING, JEV_DEFAULT_MODEL).trim() || JEV_DEFAULT_MODEL;
  const storedTtl = setting(JEV_CACHE_TTL_SETTING, "").trim();
  const ttl = storedTtl ? Number(storedTtl) : defaultCacheTtlSeconds(model);
  return {
    mode: isMode(candidate) ? candidate : "off",
    model,
    provider: isProvider(provider) ? provider : "typesafe",
    baseUrl: setting(JEV_BASE_URL_SETTING, JEV_DEFAULT_BASE_URL).trim() || JEV_DEFAULT_BASE_URL,
    timeoutMs: Number.isFinite(timeout)
      ? Math.min(JEV_MAX_TIMEOUT_MS, Math.max(JEV_MIN_TIMEOUT_MS, Math.round(timeout)))
      : JEV_DEFAULT_TIMEOUT_MS,
    cacheTtlSeconds: Number.isFinite(ttl) && ttl >= 0 ? Math.round(ttl) : defaultCacheTtlSeconds(model),
  };
}

export function jevMode(): JevMode {
  return getJevSettings().mode;
}

function apiKey(): string | null {
  try {
    return secretOrEnv("jev_api_key", "JEV_API_KEY");
  } catch {
    return null;
  }
}

export function jevConfigured(settings = getJevSettings()): boolean {
  return settings.mode !== "off" && Boolean(apiKey());
}

/** POST {base}/v1/systemone — '/systemone' alone when the base already ends in '/v1'. */
export function jevEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/v1") ? `${trimmed}/systemone` : `${trimmed}/v1/systemone`;
}

export function jevConfig(settings = getJevSettings()): JevConfig {
  return {
    ...settings,
    endpoint: jevEndpoint(settings.baseUrl),
    rubricVersion: JEV_RUBRIC_VERSION,
    purpose: JEV_PURPOSE,
    maxCandidates: JEV_MAX_CANDIDATES,
    maxQuestions: JEV_MAX_QUESTIONS,
    maxInputChars: JEV_MAX_INPUT_CHARS,
    maxInflight: JEV_MAX_INFLIGHT,
  };
}

// --- helpers ---------------------------------------------------------------

export function jevToPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.round((Math.min(2, Math.max(0, score)) / 2) * 100);
}

export function jevQuestionKey(facetIndex: number, candidateIndex: number): string {
  return `f${facetIndex}_c${candidateIndex}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function result(
  mode: JevMode,
  diagnostics: JevDiagnostic[],
  extra: Partial<JevResult> = {},
): JevResult {
  return {
    mode,
    scores: {},
    facetScores: {},
    degraded: diagnostics.length > 0 && diagnostics[0] !== "disabled",
    diagnostics,
    cacheHit: false,
    usage: {},
    latencyMs: 0,
    requestHash: "",
    confidenceProvenance: emptyConfidenceProvenance(),
    ...extra,
  };
}

// --- concurrency -----------------------------------------------------------

const inFlightByHash = new Map<string, Promise<JevResult>>();
let running = 0;
const waiters: Array<() => void> = [];

async function acquire(maxInflight: number): Promise<boolean> {
  if (running < maxInflight) {
    running += 1;
    return true;
  }
  if (waiters.length >= JEV_MAX_WAITERS) return false;
  await new Promise<void>((resolve) => waiters.push(resolve));
  running += 1;
  return true;
}

function release(): void {
  running = Math.max(0, running - 1);
  waiters.shift()?.();
}

// --- request / response ----------------------------------------------------

type JevRequestBody = {
  model: string;
  state: { query: string; facets: string[]; candidates: JevCandidate[] };
  questions: Record<string, { type: "score"; instructions: string; criteria: [string, string, string] }>;
};

function buildBody(config: JevConfig, query: string, facets: string[], candidates: JevCandidate[]): JevRequestBody {
  const questions: JevRequestBody["questions"] = {};
  for (const [facetIndex] of facets.entries()) {
    for (const [candidateIndex] of candidates.entries()) {
      questions[jevQuestionKey(facetIndex, candidateIndex)] = {
        type: "score",
        instructions: `How directly does candidates[${candidateIndex}] match facets[${facetIndex}] in the context of the full query? Evaluate independently. ${RELEVANCE_RUBRIC.instructions}`,
        criteria: [...RELEVANCE_RUBRIC.criteria] as [string, string, string],
      };
    }
  }
  return {
    model: config.model,
    state: {
      query,
      facets,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        statement: candidate.statement,
        scope: candidate.scope,
        domains: candidate.domains,
      })),
    },
    questions,
  };
}

function requestHashFor(config: JevConfig, body: string, scope: string): string {
  return createHash("sha256")
    .update(
      stableStringify({
        body,
        scope,
        endpoint: config.endpoint,
        provider: config.provider,
        rubricVersion: config.rubricVersion,
        purpose: JEV_PURPOSE,
        schema: JEV_CACHE_SCHEMA,
      }),
    )
    .digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type ParsedAnswers = {
  facetScores: Record<string, Record<string, number>>;
  scores: Record<string, number>;
  usage: JevUsage;
  reportedModel?: string;
  confidenceProvenance: JevConfidenceProvenance;
};

/**
 * Strict validation. Anything off contract throws; nothing is coerced or repaired.
 * Provider text never escapes this function.
 */
function parseAnswers(
  text: string,
  expectedKeys: string[],
  candidates: JevCandidate[],
  facetCount: number,
  provider: JevProvider,
): ParsedAnswers {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new JevFailure("answers_invalid");
  }
  const payload = record(parsed);
  const answers = record(payload.answers);
  const receivedKeys = Object.keys(answers);
  if (receivedKeys.length !== expectedKeys.length || !expectedKeys.every((key) => key in answers)) {
    throw new JevFailure("answers_invalid");
  }
  const tolerance = provider === "vercel" ? QUANTIZED_PROBABILITY_TOLERANCE : STRICT_PROBABILITY_TOLERANCE;
  const facetScores: Record<string, Record<string, number>> = {};
  const scores: Record<string, number> = {};
  const confidenceProvenance = emptyConfidenceProvenance();
  for (let facetIndex = 0; facetIndex < facetCount; facetIndex += 1) {
    const bucket: Record<string, number> = {};
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const answer = record(answers[jevQuestionKey(facetIndex, candidateIndex)]);
      if (answer.type !== "score") throw new JevFailure("answers_invalid");
      const score = Number(answer.score);
      if (!Number.isFinite(score) || score < 0 || score > 2) throw new JevFailure("answers_invalid");
      if (answer.probabilities !== undefined) {
        // Provider may send probabilities as [p0,p1,p2] or as {"0":p0,"1":p1,"2":p2}.
        const raw = answer.probabilities;
        const probabilities = Array.isArray(raw)
          ? raw
          : raw !== null && typeof raw === "object" && ["0", "1", "2"].every((k) => k in (raw as Record<string, unknown>))
            ? ["0", "1", "2"].map((k) => (raw as Record<string, unknown>)[k])
            : null;
        if (probabilities === null || probabilities.length !== 3) throw new JevFailure("answers_invalid");
        let sum = 0;
        let expectation = 0;
        for (const [position, value] of probabilities.entries()) {
          const probability = Number(value);
          if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new JevFailure("answers_invalid");
          sum += probability;
          expectation += position * probability;
        }
        if (Math.abs(sum - 1) > tolerance || Math.abs(expectation - score) > tolerance) {
          throw new JevFailure("answers_invalid");
        }
      }
      const confidence = Number(answer.confidence);
      if (answer.confidence !== undefined && Number.isFinite(confidence)) confidenceProvenance.present += 1;
      else confidenceProvenance.missing += 1;
      bucket[candidate.id] = score;
      scores[candidate.id] = Math.max(scores[candidate.id] ?? Number.NEGATIVE_INFINITY, score);
    }
    facetScores[String(facetIndex)] = bucket;
  }
  const usageRecord = record(payload.usage);
  const usage: JevUsage = {};
  if (Number.isFinite(Number(usageRecord.input_tokens))) usage.input_tokens = Number(usageRecord.input_tokens);
  if (Number.isFinite(Number(usageRecord.output_tokens))) usage.output_tokens = Number(usageRecord.output_tokens);
  const model = typeof payload.model === "string" && MODEL_NAME_PATTERN.test(payload.model) ? payload.model : undefined;
  return { facetScores, scores, usage, reportedModel: model, confidenceProvenance };
}

function diagnosticForStatus(status: number): JevDiagnostic {
  if (status === 401) return "http_unauthorized";
  if (status === 403) return "http_forbidden";
  if (status === 429) return "http_rate_limited";
  if (status >= 500 && status <= 599) return "http_server_error";
  return "http_error";
}

function diagnosticForError(error: unknown): JevDiagnostic {
  if (error instanceof JevFailure) return error.code;
  if (isAbortError(error)) return "deadline_exceeded";
  return "request_failed";
}

// --- cache -----------------------------------------------------------------

type CachedScores = { scores: Record<string, number>; facetScores: Record<string, Record<string, number>> };

function readCache(requestHash: string, ttlSeconds: number, now: number): (CachedScores & { reportedModel?: string }) | null {
  if (ttlSeconds <= 0) return null;
  try {
    const row = getJevCacheEntry(requestHash, now - ttlSeconds);
    if (!row) return null;
    const parsed = record(JSON.parse(row.scoresJson));
    const scores = record(parsed.scores) as Record<string, number>;
    const facetScores = record(parsed.facetScores) as Record<string, Record<string, number>>;
    if (!Object.keys(scores).length) return null;
    return { scores, facetScores, reportedModel: row.reportedModel || undefined };
  } catch {
    return null;
  }
}

function writeCache(requestHash: string, parsed: ParsedAnswers, now: number): void {
  try {
    saveJevCacheEntry(
      requestHash,
      JSON.stringify({ scores: parsed.scores, facetScores: parsed.facetScores }),
      parsed.reportedModel || "",
      now,
    );
  } catch {
    // A cache write failure is never fatal for a completed evaluation.
  }
}

// --- entry point -----------------------------------------------------------

export async function jevScore(args: {
  query: string;
  facets: string[];
  candidates: JevCandidate[];
  scope?: string;
}): Promise<JevResult> {
  const settings = getJevSettings();
  if (settings.mode === "off") return result("off", ["disabled"]);

  const config = jevConfig(settings);
  const mode = config.mode;
  if (!config.endpoint || !isAllowedJevEndpoint(config.endpoint)) return result(mode, ["endpoint_invalid"]);

  const key = apiKey();
  if (!key) return result(mode, ["credentials_missing"]);

  const facets = args.facets.map((facet) => String(facet || "").trim()).filter(Boolean);
  const candidates = args.candidates;
  if (!facets.length || facets.length > JEV_MAX_FACETS) return result(mode, ["budget_exceeded"]);
  if (!candidates.length || candidates.length > config.maxCandidates) return result(mode, ["budget_exceeded"]);
  if (candidates.length * facets.length > config.maxQuestions) return result(mode, ["budget_exceeded"]);
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    return result(mode, ["payload_invalid"]);
  }

  const scope = String(args.scope || "");
  const body = JSON.stringify(buildBody(config, String(args.query || ""), facets, candidates));
  if (body.length > config.maxInputChars) return result(mode, ["budget_exceeded"]);

  const requestHash = requestHashFor(config, body, scope);
  const now = Math.floor(Date.now() / 1000);
  const cached = readCache(requestHash, config.cacheTtlSeconds, now);
  if (cached) {
    return result(mode, [], {
      scores: cached.scores,
      facetScores: cached.facetScores,
      cacheHit: true,
      requestHash,
      reportedModel: cached.reportedModel,
    });
  }

  const pending = inFlightByHash.get(requestHash);
  if (pending) return pending;

  const run = execute(config, key, body, facets.length, candidates, requestHash).finally(() => {
    inFlightByHash.delete(requestHash);
  });
  inFlightByHash.set(requestHash, run);
  return run;
}

async function execute(
  config: JevConfig,
  key: string,
  body: string,
  facetCount: number,
  candidates: JevCandidate[],
  requestHash: string,
): Promise<JevResult> {
  const admitted = await acquire(config.maxInflight);
  if (!admitted) return result(config.mode, ["capacity_exceeded"], { requestHash });

  const startedAt = performance.now();
  try {
    const expectedKeys = Object.keys((JSON.parse(body) as JevRequestBody).questions);
    const response = await transport()(
      {
        url: config.endpoint,
        body,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      },
      AbortSignal.timeout(config.timeoutMs),
    );
    if (response.status < 200 || response.status > 299) {
      return result(config.mode, [diagnosticForStatus(response.status)], {
        requestHash,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    }
    const parsed = parseAnswers(response.text, expectedKeys, candidates, facetCount, config.provider);
    const latencyMs = Math.round(performance.now() - startedAt);
    writeCache(requestHash, parsed, Math.floor(Date.now() / 1000));
    return result(config.mode, [], {
      scores: parsed.scores,
      facetScores: parsed.facetScores,
      usage: parsed.usage,
      confidenceProvenance: parsed.confidenceProvenance,
      latencyMs,
      requestHash,
      reportedModel: parsed.reportedModel,
    });
  } catch (error) {
    return result(config.mode, [diagnosticForError(error)], {
      requestHash,
      latencyMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    release();
  }
}

// --- ledger ----------------------------------------------------------------

/**
 * Appends one shadow observation row per (subject, question) and one usage
 * event. Both are best effort: a ledger failure must never turn a completed
 * evaluation into a failure for the caller.
 */
export function recordJevScores(args: {
  subjectKind: string;
  entries: JevScoreEntry[];
  result: JevResult;
  now?: number;
}): number {
  const now = args.now ?? Math.floor(Date.now() / 1000);
  let written = 0;
  try {
    written = recordJevScoreRows({
      subjectKind: args.subjectKind,
      entries: args.entries,
      mode: args.result.mode,
      model: args.result.reportedModel || "",
      latencyMs: args.result.latencyMs,
      requestHash: args.result.requestHash,
      diagnostics: args.result.diagnostics,
      now,
    });
  } catch {
    // Ledger writes are observational only.
  }
  try {
    recordUsageEvent({
      kind: "score:jev",
      provider: "jev",
      model: args.result.reportedModel || getJevSettings().model,
      units: 1,
      estimatedUsd: args.result.cacheHit || args.result.degraded ? 0 : JEV_ESTIMATED_USD,
      metadata: {
        mode: args.result.mode,
        degraded: args.result.degraded,
        cacheHit: args.result.cacheHit,
        diagnostics: args.result.diagnostics,
        latencyMs: args.result.latencyMs,
        requestHash: args.result.requestHash,
        inputTokens: args.result.usage.input_tokens ?? 0,
        outputTokens: args.result.usage.output_tokens ?? 0,
        subjects: args.entries.length,
      },
      now,
    });
  } catch {
    // Usage accounting must never turn a completed evaluation into a failure.
  }
  return written;
}
