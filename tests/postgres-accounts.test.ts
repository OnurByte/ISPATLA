import { expect, test } from "bun:test";
import { mapPostgresCategory } from "@/server/postgres-accounts";
import { categories } from "@/server/postgres-schema";

test("PostgreSQL category mapping parses stored JSON and safely defaults malformed JSON", () => {
  const row = {
    id: 12, slug: "account-7-tech", name: "Teknoloji", enabled: 1, builtIn: 0, baseStrategy: "technology",
    clusterStrategy: "topic", verificationMode: "moderate", description: "Teknoloji haberleri", positiveExamplesJson: '["yeni cihaz"]',
    negativeExamplesJson: "broken", keywordsJson: '["yapay zeka"]', excludedKeywordsJson: "[]", seedHandlesJson: '["@account"]',
    defaultFormatsJson: '["post"]', sourcePolicyJson: "{}", riskPolicyJson: '{"limit":2}', scoringPolicyJson: "{}",
    publishingPolicyJson: "{}", aiContext: "", createdAt: 10, updatedAt: 11, ownerUserId: "owner-1", accountId: 7,
  } as typeof categories.$inferSelect;

  expect(mapPostgresCategory(row)).toEqual({
    id: 12, slug: "account-7-tech", name: "Teknoloji", enabled: true, builtIn: false, baseStrategy: "technology",
    clusterStrategy: "topic", verificationMode: "moderate", description: "Teknoloji haberleri", positiveExamples: ["yeni cihaz"],
    negativeExamples: [], keywords: ["yapay zeka"], excludedKeywords: [], seedHandles: ["@account"], defaultFormats: ["post"],
    sourcePolicy: {}, riskPolicy: { limit: 2 }, scoringPolicy: {}, publishingPolicy: {}, aiContext: "", createdAt: 10,
    updatedAt: 11, ownerUserId: "owner-1", accountId: 7,
  });
});
