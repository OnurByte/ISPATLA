import { expect, test } from "bun:test";
import { buildJevRequestBody, jevConfig, jevFixedChars, jevPlanCandidateChunks, JEV_MAX_INPUT_CHARS } from "@/server/jev";
import { toJevCandidate, accountFacet } from "@/server/opportunity-batch";
import type { Account, CategoryDefinition } from "@/server/db-types";

const post = { externalId: "123", sourceHandle: "wire", text: "Birinci satır\nKaynağın devamı" };

test("keeps bounded, data-only Jev candidate and facet helpers", () => {
  expect(toJevCandidate(post, ["news"])).toEqual({ id: "123", title: "Birinci satır", statement: post.text, scope: "wire", domains: ["news"] });
  const account = { id: 1, handle: "writer", styleProfile: { niche: "teknoloji" } } as unknown as Account;
  const category = { enabled: true, slug: "tech", name: "Teknoloji", description: "Ürünler", keywords: ["AI"] } as CategoryDefinition;
  expect(accountFacet(account, [category], [{ accountId: 1, categorySlug: "tech", enabled: true } as never])).toContain("@writer");
});

test("plans Jev requests under the provider body budget", () => {
  const candidates = Array.from({ length: 32 }, (_, index) => ({ id: String(index), title: `Post ${index}`, statement: "kanıt ".repeat(80), scope: "wire", domains: ["news"] }));
  const facets = ["News", "Technology", "Finance"];
  const config = { ...jevConfig(), model: "jev-latest" };
  const bodyBudget = jevFixedChars("Soru", config.model);
  const perCall = jevPlanCandidateChunks({ candidateCount: candidates.length, facets, statementChars: 400, fixedChars: bodyBudget, titleChars: 20, scopeChars: 8, domainsChars: 10, safetyChars: 0 });
  expect(perCall).toBeGreaterThan(0);
  expect(perCall).toBeLessThan(candidates.length);
  const request = buildJevRequestBody(config, "Soru", facets, candidates.slice(0, perCall));
  expect(JSON.stringify(request).length).toBeLessThanOrEqual(JEV_MAX_INPUT_CHARS);
});
