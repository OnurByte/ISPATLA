import { expect, test } from "bun:test";
import { discoverAccountTopic, inferAccountCategories, normalizeCategoryInferenceSelection } from "../src/server/account-inference";

const catalog = [
  { id: 1, slug: "technology", name: "Technology", keywords: ["software", "linux", "open source"], description: "Technology" },
  { id: 2, slug: "finance", name: "Finance", keywords: ["stocks", "markets"], description: "Finance" },
];

test("infers only catalog topics evidenced by the account bio and its own posts", () => {
  const result = inferAccountCategories({
    handle: "dev_ada", displayName: "Ada Dev", bio: "Linux and open source engineer",
    posts: ["Building software on Linux", "Open source software is great"], catalog,
  });
  expect(result.suggestions.map(({ slug }) => slug)).toEqual(["technology"]);
  expect(result.suggestions[0].confidence).toBeGreaterThan(0);
  expect(result.suggestions[0].evidence).toContain("linux");
  expect(result.contentLanguage).toBe("en");
});

test("returns no invented topics when the profile has insufficient evidence", () => {
  const result = inferAccountCategories({ handle: "x_user", displayName: "X", bio: "", posts: ["Hello world"], catalog });
  expect(result.suggestions).toEqual([]);
  expect(result.status).toBe("insufficient_evidence");
  expect(result.contentLanguage).toBe("unknown");
});

test("finds a repeated account topic when the catalog has no match", () => {
  const topic = discoverAccountTopic({ bio: "", posts: ["Building secure Bitcoin wallet infrastructure", "Bitcoin wallet recovery guide", "Bitcoin wallet safety tips"] });
  expect(topic?.name).toBe("Bitcoin Wallet");
  expect(topic?.slug).toBe("bitcoin-wallet");
  expect(topic?.keywords).toEqual(["bitcoin", "wallet"]);
  expect(topic?.evidence).toHaveLength(3);
  expect(discoverAccountTopic({ bio: "", posts: ["Hello world"] })).toBeNull();
});

test("normalizes accepted category selections and rejects invalid ids or selected weights", () => {
  expect(normalizeCategoryInferenceSelection([1, 1, 2], { "1": 2.5, "2": 0 })).toEqual({
    categoryIds: [1, 2], weights: { "1": 2.5, "2": 0 },
  });
  expect(() => normalizeCategoryInferenceSelection([0], {})).toThrow("Kategori seçimi geçersiz");
  expect(() => normalizeCategoryInferenceSelection([1], { "1": 10.1 })).toThrow("category weight is invalid");
  expect(normalizeCategoryInferenceSelection(Array.from({ length: 13 }, (_, index) => index + 1), {}).categoryIds).toHaveLength(12);
});
