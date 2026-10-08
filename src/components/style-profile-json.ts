import { LOCALES } from "@/i18n/config";

export type StyleProfileChange = { key: string; before: unknown; after: unknown };
export const STYLE_PROFILE_SCHEMA_VERSION = 1;

const STRING_LIMITS: Record<string, number> = {
  tone: 500,
  ideology: 120,
  opening: 500,
  emoji: 200,
  attribution: 500,
  formatRule: 500,
  niche: 500,
  bio: 1000,
  contentLocale: 40,
};
const ARRAY_FIELDS = new Set(["categories", "preferredFormats", "writingSkillIds", "preferredLocales"]);
const PROFILE_FIELDS = new Set([...Object.keys(STRING_LIMITS), ...ARRAY_FIELDS, "aiRoute", "postingSchedule", "voice"]);
const AI_ROUTE_FIELDS = new Set([
  "analysisProvider", "analysisModel", "writingProvider", "writingModel",
  "reviewProvider", "reviewModel", "fallbackProvider", "fallbackModel",
]);
const VOICE_FEATURE_NUMBERS = new Set([
  "sampleSize", "usableSampleSize", "avgChars", "medianChars", "p90Chars", "avgWords", "avgSentences",
  "multiLineRate", "emojiRate", "hashtagRate", "questionRate", "linkRate", "mentionRate", "numberRate", "allCapsWordRate",
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function invalid(message: string): never { throw new Error(message); }

function validateJsonValue(value: unknown, depth = 0): void {
  if (depth > 12) invalid("Profil JSON'u çok derin.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (value.length > 200) invalid("Profil listesi çok uzun.");
    value.forEach((item) => validateJsonValue(item, depth + 1));
    return;
  }
  if (typeof value !== "object") invalid("Profil JSON'u yalnız JSON değerleri içerebilir.");
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) invalid("Profilde güvenli olmayan bir alan adı var.");
    validateJsonValue(item, depth + 1);
  }
}

function validateAiRoute(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("aiRoute bir nesne olmalı.");
  for (const [key, item] of Object.entries(value)) {
    if (!AI_ROUTE_FIELDS.has(key)) invalid(`aiRoute.${key} desteklenmiyor.`);
    if (key.endsWith("Provider")) {
      if (item !== "api" && item !== "compatible" && item !== "codex") invalid(`${key} geçersiz.`);
    } else if (typeof item !== "string" || item.length > 160 || /\s/u.test(item)) invalid(`${key} geçersiz.`);
  }
}

function validatePostingSchedule(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("postingSchedule bir nesne olmalı.");
  const schedule = value as Record<string, unknown>;
  if (Object.keys(schedule).some((key) => key !== "quietHours")) invalid("postingSchedule içinde desteklenmeyen alan var.");
  const quiet = schedule.quietHours;
  if (quiet === undefined) return;
  if (!quiet || typeof quiet !== "object" || Array.isArray(quiet)) invalid("quietHours bir nesne olmalı.");
  const hours = quiet as Record<string, unknown>;
  if (Object.keys(hours).some((key) => !["start", "end", "timeZone"].includes(key))) invalid("quietHours içinde desteklenmeyen alan var.");
  if (typeof hours.start !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(hours.start)) invalid("quietHours.start HH:mm biçiminde olmalı.");
  if (typeof hours.end !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(hours.end)) invalid("quietHours.end HH:mm biçiminde olmalı.");
  if (hours.start === hours.end) invalid("quietHours başlangıç ve bitişi farklı olmalı.");
  if (typeof hours.timeZone !== "string" || hours.timeZone.length > 100 || !hours.timeZone.trim()) invalid("quietHours.timeZone gerekli.");
  try { new Intl.DateTimeFormat("en", { timeZone: hours.timeZone }).format(0); }
  catch { invalid("quietHours.timeZone geçersiz."); }
}

function validateVoiceProfile(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("voice bir nesne olmalı.");
  const voice = value as Record<string, unknown>;
  if (Object.keys(voice).some((key) => !["handle", "version", "features", "exemplars", "voiceContract"].includes(key))) invalid("voice içinde desteklenmeyen alan var.");
  if (typeof voice.handle !== "string" || voice.handle.length > 100) invalid("voice.handle geçersiz.");
  if (voice.version !== 1) invalid("voice.version desteklenmiyor.");
  if (typeof voice.voiceContract !== "string" || voice.voiceContract.length > 6000) invalid("voice.voiceContract geçersiz.");
  if (!voice.features || typeof voice.features !== "object" || Array.isArray(voice.features)) invalid("voice.features bir nesne olmalı.");
  const features = voice.features as Record<string, unknown>;
  const featureKeys = new Set([...VOICE_FEATURE_NUMBERS, "openingPatterns", "topWords", "topPhrases"]);
  if (Object.keys(features).some((key) => !featureKeys.has(key))) invalid("voice.features içinde desteklenmeyen alan var.");
  for (const key of VOICE_FEATURE_NUMBERS) {
    const item = features[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) invalid(`voice.features.${key} geçersiz.`);
  }
  for (const key of ["openingPatterns", "topWords", "topPhrases"]) {
    const list = features[key];
    if (list !== undefined && (!Array.isArray(list) || list.length > 100 || list.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true;
      const entry = item as Record<string, unknown>;
      return Object.keys(entry).some((field) => !["value", "count"].includes(field)) || typeof entry.value !== "string" || entry.value.length > 120 || typeof entry.count !== "number" || !Number.isFinite(entry.count) || entry.count < 0;
    }))) invalid(`voice.features.${key} geçersiz.`);
  }
  const exemplars = voice.exemplars;
  if (exemplars !== undefined && (!Array.isArray(exemplars) || exemplars.length > 8 || exemplars.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !["id", "url", "text", "engagement", "likes", "reposts", "replies", "views"].includes(key))) return true;
    return ["id", "url", "text"].some((key) => typeof entry[key] !== "string")
      || String(entry.text).length > 280
      || ["engagement", "likes", "reposts", "replies", "views"].some((key) => typeof entry[key] !== "number" || !Number.isFinite(entry[key]) || (entry[key] as number) < 0);
  }))) invalid("voice.exemplars geçersiz.");
}

/** Validate the supported account style-profile contract before it reaches the save API. */
export function validateStyleProfile(value: unknown, options: { allowEditorialInstruction?: boolean } = {}): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("JSON bir nesne olmalı.");
  const profile = value as Record<string, unknown>;
  validateJsonValue(profile);
  for (const [key, item] of Object.entries(profile)) {
    if (Object.hasOwn(STRING_LIMITS, key)) {
      if (typeof item !== "string" || item.length > STRING_LIMITS[key]) invalid(`${key} metin olmalı ve ${STRING_LIMITS[key]} karakteri aşmamalı.`);
      if (key === "contentLocale" && item !== "" && !(LOCALES as readonly string[]).includes(item)) invalid("contentLocale desteklenen bir arayüz dil kodu olmalı.");
    } else if (key === "editorialInstruction") {
      if (!options.allowEditorialInstruction) invalid("editorialInstruction ayrı hesap yönergesi alanından düzenlenmeli.");
      if (typeof item !== "string" || item.length > 6000) invalid("editorialInstruction metin olmalı ve 6000 karakteri aşmamalı.");
    } else if (ARRAY_FIELDS.has(key)) {
      if (!Array.isArray(item) || item.length > 100 || item.some((entry) => typeof entry !== "string" || entry.length > 120)) invalid(`${key} geçersiz bir liste.`);
      if (key === "preferredLocales" && item.some((entry) => !(LOCALES as readonly string[]).includes(entry as string))) invalid("preferredLocales desteklenmeyen bir dil kodu içeriyor.");
    } else if (key === "aiRoute") validateAiRoute(item);
    else if (key === "postingSchedule") validatePostingSchedule(item);
    else if (key === "voice") validateVoiceProfile(item);
    else invalid(`“${key}” desteklenen hesap profili alanlarından değil.`);
  }
  return profile;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/**
 * PATCH validation allows opaque legacy fields only when their value is
 * unchanged. This keeps the Accounts page's whole-profile round trip working
 * without making unknown or policy-like fields writable.
 */
export function validateStyleProfilePatch(value: unknown, previous: Record<string, unknown>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("styleProfile bir JSON nesnesi olmalı.");
  const profile = value as Record<string, unknown>;
  validateJsonValue(profile);
  validateJsonValue(previous);
  const keys = new Set([...Object.keys(previous), ...Object.keys(profile)]);
  for (const key of keys) {
    const hasNext = Object.hasOwn(profile, key);
    const hasPrevious = Object.hasOwn(previous, key);
    if (hasNext && hasPrevious && stableValue(profile[key]) === stableValue(previous[key])) continue;
    if (!hasNext) {
      if (!PROFILE_FIELDS.has(key) && key !== "editorialInstruction") invalid(`Legacy “${key}” alanı değiştirilemez veya silinemez.`);
      continue;
    }
    if (key !== "editorialInstruction" && !PROFILE_FIELDS.has(key)) invalid(`“${key}” desteklenmeyen hesap profili alanı.`);
    validateStyleProfile({ [key]: profile[key] }, { allowEditorialInstruction: true });
  }
  return profile;
}

export function parseStyleProfileJson(value: string): Record<string, unknown> {
  return validateStyleProfile(JSON.parse(value) as unknown);
}

export function diffStyleProfiles(before: Record<string, unknown>, after: Record<string, unknown>): StyleProfileChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) => a.localeCompare(b, "tr-TR"));
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}
