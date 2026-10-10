import { expect, test } from "bun:test";
import { accountFacet, dayKey, preferredRelevanceAccount, toJevCandidate, JEV_BATCH_QUERY } from "@/server/opportunity-batch";
import type { Account, AccountCategoryConfig, CategoryDefinition, RecentPost } from "@/server/db-types";

const account = (id: number, enabled = true): Account => ({ id, accountKey: String(id), handle: `acc${id}`, displayName: `Account ${id}`, enabled, defaultAccount: false, automationMode: "auto", dailyLimit: 24, capabilities: [], styleProfile: { niche: "teknoloji" }, subscriptionHistory: [], subscriptionState: { tier: "unknown", observedAt: 0, historyComplete: false }, updatedAt: 0 });

test("candidate and account facet serialization is bounded and scoped", () => {
  expect(JEV_BATCH_QUERY).toContain("aday hesabın");
  const post = { externalId: "123", sourceHandle: "wire", text: "  İlk satır  \n ikinci satır" };
  expect(toJevCandidate(post, ["news", "tech"])).toEqual({ id: "123", title: "İlk satır", statement: "İlk satır  \n ikinci satır", scope: "wire", domains: ["news", "tech"] });
  const categories = [{ enabled: true, slug: "tech", name: "Teknoloji", description: "Yazılım", keywords: ["AI"] }] as CategoryDefinition[];
  const configs = [{ accountId: 1, categorySlug: "tech", enabled: true }] as AccountCategoryConfig[];
  expect(accountFacet(account(1), categories, configs)).toContain("@acc1 yayın alanı");
  expect(dayKey(Date.UTC(2025, 0, 2) / 1000)).toBe("jev_batch:2025-01-02");
});

test("relevance only selects an eligible account when the top score is unique", () => {
  const posts = { relevanceJson: JSON.stringify({ perAccount: { 1: 30, 2: 85 } }) } as RecentPost;
  expect(preferredRelevanceAccount([account(1), account(2)], posts)?.id).toBe(2);
  expect(preferredRelevanceAccount([account(1), account(2)], { relevanceJson: "{}" } as RecentPost)).toBeUndefined();
  expect(preferredRelevanceAccount([account(1), account(2)], { relevanceJson: JSON.stringify({ perAccount: { 1: 85, 2: 85 } }) } as RecentPost)).toBeUndefined();
  expect(preferredRelevanceAccount([account(1, false), account(2)], posts)?.id).toBe(2);
});
