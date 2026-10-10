import { expect, test } from "bun:test";
import {
  buildJevRequestBody,
  defaultCacheTtlSeconds,
  getJevSettings,
  isAliasModel,
  jevEndpoint,
  jevPlanCandidateChunks,
  jevToPercent,
} from "@/server/jev";
import { isAllowedJevEndpoint } from "@/server/security";

test("Jev endpoint validation rejects insecure or credential-bearing URLs", () => {
  expect(isAllowedJevEndpoint("https://api.typesafe.ai/v1/systemone")).toBe(true);
  expect(isAllowedJevEndpoint("http://api.typesafe.ai/v1/systemone")).toBe(false);
  expect(isAllowedJevEndpoint("https://user:pass@api.typesafe.ai/v1/systemone")).toBe(false);
  expect(isAllowedJevEndpoint("https://api.typesafe.ai/v1/systemone?key=1")).toBe(false);
  expect(isAllowedJevEndpoint("http://localhost:8080/v1/systemone")).toBe(true);
  expect(isAllowedJevEndpoint("not a url")).toBe(false);
});

test("Jev endpoint builder appends the systemone path once", () => {
  expect(jevEndpoint("https://api.typesafe.ai")).toBe("https://api.typesafe.ai/v1/systemone");
  expect(jevEndpoint("https://api.typesafe.ai/")).toBe("https://api.typesafe.ai/v1/systemone");
  expect(jevEndpoint("https://api.typesafe.ai/v1")).toBe("https://api.typesafe.ai/v1/systemone");
});

test("Jev model aliases use a shorter cache window and scores clamp to the 0-100 range", () => {
  expect(isAliasModel("jev-latest")).toBe(true);
  expect(isAliasModel("typesafe/jev-1.13.0")).toBe(false);
  expect(defaultCacheTtlSeconds("jev-latest")).toBe(300);
  expect(defaultCacheTtlSeconds("jev-1.13.0")).toBe(3600);
  expect([jevToPercent(0), jevToPercent(1), jevToPercent(1.5), jevToPercent(2), jevToPercent(9), jevToPercent(Number.NaN)])
    .toEqual([0, 50, 75, 100, 100, 0]);
});

test("Jev request body preserves the local candidate and facet contract", () => {
  const settings = getJevSettings();
  const body = buildJevRequestBody({
    ...settings,
    endpoint: jevEndpoint(settings.baseUrl),
    rubricVersion: "relevance-v1",
    purpose: "relevance",
    maxCandidates: 32,
    maxQuestions: 96,
    maxInputChars: 24_000,
    maxInflight: 1,
  }, "query", ["gündem"], [{ id: "c1", title: "Başlık", statement: "Aday", scope: "news", domains: ["local"] }]);
  expect(body.state).toEqual({ query: "query", facets: ["gündem"], candidates: [{ id: "c1", title: "Başlık", statement: "Aday", scope: "news", domains: ["local"] }] });
  expect(body.questions).toHaveProperty("f0_c0");
});

test("Jev candidate planner never exceeds the question or input budget", () => {
  const available = jevPlanCandidateChunks({ candidateCount: 32, facets: ["a", "b", "c"], statementChars: 40, maxInputChars: 10_000, safetyChars: 0 });
  const tooSmall = jevPlanCandidateChunks({ candidateCount: 1, facets: ["a"], statementChars: 40, fixedChars: 10_000, maxInputChars: 10_000, safetyChars: 0 });
  expect(available).toBeGreaterThan(0);
  expect(available).toBeLessThanOrEqual(32);
  expect(available * 3).toBeLessThanOrEqual(96);
  expect(tooSmall).toBe(0);
});
