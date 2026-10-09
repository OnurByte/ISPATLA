import { expect, test } from "bun:test";
import { diffStyleProfiles, parseStyleProfileJson, validateStyleProfile } from "@/components/style-profile-json";

test("advanced account profile JSON accepts canonical account fields and round-trips generated voice data", () => {
  const profile = {
    tone: "sade",
    categories: ["technology"],
    preferredFormats: ["news"],
    writingSkillIds: ["newsroom-style"],
    aiRoute: { writingProvider: "api", writingModel: "gpt-4.1-mini" },
    voice: { version: 1, handle: "test", voiceContract: "Ölçülen yazım biçimi", features: { sampleSize: 1, usableSampleSize: 1, avgChars: 25 }, exemplars: [{ id: "post-1", url: "https://x.com/test/status/1", text: "kendi postu", engagement: 1, likes: 1, reposts: 0, replies: 0, views: 0 }] },
    postingSchedule: { quietHours: { start: "23:00", end: "07:00", timeZone: "Europe/Istanbul" } },
  };
  expect(parseStyleProfileJson(JSON.stringify(profile))).toEqual(profile);
});

test("advanced account profile JSON rejects malformed values, unknown policy keys, and invalid nested settings", () => {
  for (const value of ["{", "null", "[]", '"text"', "42", '{"__proto__":{"polluted":true}}']) expect(() => parseStyleProfileJson(value)).toThrow();
  for (const value of [
    { publishWithoutReview: true },
    { editorialInstruction: "separate editor owns this field" },
    { aiRoute: { writingProvider: "arbitrary" } },
    { aiRoute: { publishGate: false } },
    { voice: { version: 1, handle: "test", voiceContract: "", features: {}, publishWithoutReview: true } },
    { postingSchedule: { quietHours: { start: "25:00", end: "07:00", timeZone: "UTC" } } },
    { tone: 3 },
    { preferredLocales: ["en", "xx"] },
  ]) expect(() => validateStyleProfile(value)).toThrow();
  expect(validateStyleProfile({ preferredLocales: ["ja", "en"] }).preferredLocales).toEqual(["ja", "en"]);
});

test("profile diff reports only changed top-level canonical fields", () => {
  expect(diffStyleProfiles(
    { tone: "sade", aiRoute: { writingProvider: "api" }, categories: ["news"] },
    { tone: "doğrudan", aiRoute: { writingProvider: "codex" }, niche: "teknoloji" },
  )).toEqual([
    { key: "aiRoute", before: { writingProvider: "api" }, after: { writingProvider: "codex" } },
    { key: "categories", before: ["news"], after: undefined },
    { key: "niche", before: undefined, after: "teknoloji" },
    { key: "tone", before: "sade", after: "doğrudan" },
  ]);
});
