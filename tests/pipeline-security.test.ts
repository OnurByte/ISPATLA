import { describe, expect, test } from "bun:test";
import { accountCategories, accountCategoryConfigFor, categoryPublishingPaused, exclusiveSourceAttribution, feedbackFromTweet, formatSourceAttribution, mediaCandidate, normalisePost, qualityGate, reconciliationMatches, resolveAccountAiRoute, selectPublishingAccount } from "@/server/pipeline";
import type { Account, AccountCategoryConfig, ObservedPost, SourceCategoryConfig, SourceConfig } from "@/server/db";

function post(overrides: Partial<ObservedPost> = {}): ObservedPost {
  return {
    externalId: "123",
    sourceHandle: "bpthaber",
    authorHandle: "bpthaber",
    statusUrl: "https://x.com/bpthaber/status/123",
    text: "Kaynak haber metni burada.",
    createdTimestamp: Math.floor(Date.now() / 1000) - 900,
    likes: 100,
    replies: 10,
    reposts: 20,
    quotes: 1,
    views: 10_000,
    mediaCount: 0,
    mediaJson: "[]",
    rawJson: "{}",
    score: 80,
    scoreReason: "test",
    sensitive: false,
    clusterKey: "kaynak-haber-metni",
    ...overrides,
  };
}

function account(id: number, defaultAccount = false): Account {
  return { id, accountKey: String(id), handle: `account${id}`, displayName: "", xuseAccountId: "", enabled: true, defaultAccount, automationMode: "auto", dailyLimit: 24, capabilities: [], styleProfile: {}, subscriptionHistory: [], subscriptionState: { tier: "unknown", observedAt: 0, historyComplete: false }, updatedAt: 0 };
}

describe("pipeline trust boundaries", () => {
  test("rejects non-numeric external ids and sanitizes external status URLs", () => {
    expect(normalisePost("bpthaber", { id: "not-an-x-id", text: "haber" })).toBeNull();
    const normalized = normalisePost("bpthaber", {
      id: "123",
      text: "haber metni",
      url: "javascript:alert(1)",
      author: { screen_name: "bpthaber" },
    });
    expect(normalized?.statusUrl).toBe("https://x.com/bpthaber/status/123");
  });

  test("never selects media outside the exact Twitter media allowlist", () => {
    const media = mediaCandidate(
      post({
        mediaCount: 2,
        mediaJson: JSON.stringify([
          { type: "photo", url: "https://pbs.twimg.com.evil.example/a.jpg" },
          { type: "photo", url: "https://pbs.twimg.com/media/a.jpg?format=jpg" },
        ]),
      }),
    );
    expect(media).toEqual({ kind: "photo", url: "https://pbs.twimg.com/media/a.jpg?format=jpg" });
  });

  test("blocks copied, near-copied, oversized and sensitive drafts before publish", () => {
    expect(qualityGate(post(), "Kaynak haber metni burada.")).toBe("draft copies source text");
    const source = "Cumhurbaşkanı Erdoğan başkanlığındaki devlet erkanı 30 Ağustos Zafer Bayramı dolayısıyla Anıtkabir'i ziyaret etti.";
    expect(qualityGate(post({ text: source }), `${source} (BPT)`)).toBe("draft copies source text");
    expect(qualityGate(post({ text: source }), "30 Ağustos Zafer Bayramı dolayısıyla devlet erkanı Anıtkabir'de Erdoğan başkanlığında bir araya geldi.")).toBeNull();
    expect(qualityGate(post(), "çok kısa")).toBe("draft is too short");
    expect(qualityGate(post({ sensitive: true }), "Bu özgün ve yeterince uzun bir taslaktır.")).toBe(
      "sensitive source is not autopilot eligible",
    );
    expect(qualityGate(post(), "a".repeat(281))).toBe("draft exceeds X character limit");
  });

  test("normalizes a confirmed post feedback snapshot", () => {
    expect(feedbackFromTweet({ likes: "12", replies: 3, retweets: 4, quotes: 5, views: "600" }, "123", 456)).toEqual({
      externalId: "123", likes: 12, replies: 3, reposts: 4, quotes: 5, views: 600, now: 456,
    });
    expect(feedbackFromTweet({ likes: 0, replies: 0, retweets: 0, quotes: 0, views: 20, poll: { total_votes: 9 } }, "124", 456)).toMatchObject({ pollVotes: 9 });
  });

  test("uses the default account until feedback identifies a better account", () => {
    const accounts = [account(1, true), account(2)];
    expect(selectPublishingAccount(accounts, () => null)?.id).toBe(1);
    expect(selectPublishingAccount(accounts, (id) => id === 2 ? 80 : 30)?.id).toBe(2);
    expect(selectPublishingAccount(accounts, (id) => id === 2 ? 80 : 30, undefined, [], false, [], [], (id) => id === 2 ? 1 : 0)?.id).toBe(1);
  });

  test("does not cross an explicitly configured source/account editorial axis", () => {
    const source = { profile: { ideology: "seküler", ideologyTags: [] } } as unknown as SourceConfig;
    expect(selectPublishingAccount([account(1)], () => null, source)).toBeUndefined();
    expect(selectPublishingAccount([{ ...account(1), styleProfile: { ideology: "seküler" } }], () => null, source)?.id).toBe(1);
    const taggedSource = { profile: { ideology: "belirsiz", ideologyTags: ["islamcı"] } } as unknown as SourceConfig;
    expect(selectPublishingAccount([account(1)], () => null, taggedSource)).toBeUndefined();
  });

  test("routes automatic publishing only to configured matching categories", () => {
    const technology = { ...account(1), automationMode: "auto" as const, styleProfile: { categories: ["teknoloji", "haber"] } };
    const magazine = { ...account(2), automationMode: "auto" as const, styleProfile: { categories: ["magazin"] } };
    expect(accountCategories(technology)).toEqual(["teknoloji", "haber"]);
    expect(selectPublishingAccount([technology, magazine], () => null, undefined, ["magazin"], true)?.id).toBe(2);
    expect(selectPublishingAccount([technology], () => null, undefined, ["magazin"], true)).toBeUndefined();
  });

  test("prefers first-class account categories over legacy style tags", () => {
    const configured = { ...account(1), styleProfile: { categories: ["teknoloji"] } };
    const categories: AccountCategoryConfig[] = [{
      accountId: 1, categoryId: 9, categorySlug: "meme", categoryName: "Meme", enabled: true, primary: true,
      weight: 1, priority: 0, publishThreshold: null, dailyBudget: null, styleOverride: {}, aiRouteOverride: {},
    }];
    expect(selectPublishingAccount([configured], () => null, undefined, ["meme"], true, categories)?.id).toBe(1);
    expect(selectPublishingAccount([configured], () => null, undefined, ["teknoloji"], true, categories)).toBeUndefined();
  });

  test("uses primary then priority category policy for publish overrides", () => {
    const categories: AccountCategoryConfig[] = [
      { accountId: 1, categoryId: 1, categorySlug: "news", categoryName: "News", enabled: true, primary: false, weight: 1, priority: 9, publishThreshold: 75, dailyBudget: null, styleOverride: { tone: "news" }, aiRouteOverride: {} },
      { accountId: 1, categoryId: 2, categorySlug: "politics", categoryName: "Politics", enabled: true, primary: true, weight: 1, priority: 1, publishThreshold: 90, dailyBudget: null, styleOverride: { tone: "politics" }, aiRouteOverride: {} },
    ];
    expect(accountCategoryConfigFor(1, ["news", "politics"], categories)).toMatchObject({ categorySlug: "politics", publishThreshold: 90 });
  });

  test("resolves category AI routes before account routes and preserves explicit fallback", () => {
    const configured = { ...account(1), styleProfile: { aiRoute: { writingProvider: "codex", writingModel: "account", fallbackProvider: "api", fallbackModel: "fallback" } } };
    const category = { accountId: 1, categoryId: 1, categorySlug: "news", categoryName: "News", enabled: true, primary: true, weight: 1, priority: 0, publishThreshold: null, dailyBudget: null, styleOverride: {}, aiRouteOverride: { writingProvider: "compatible", writingModel: "category" } };
    expect(resolveAccountAiRoute(configured, category, "writing")).toEqual({ provider: "compatible", model: "category", fallbackProvider: "api", fallbackModel: "fallback" });
    expect(resolveAccountAiRoute(configured, undefined, "analysis")).toEqual({ provider: undefined, model: undefined, fallbackProvider: "api", fallbackModel: "fallback" });
  });

  test("honors an enabled source category policy during automatic selection", () => {
    const source = { handle: "wire", profile: { ideology: "belirsiz", ideologyTags: [] } } as unknown as SourceConfig;
    const categories: SourceCategoryConfig[] = [{ sourceHandle: "wire", categoryId: 1, categorySlug: "news", categoryName: "News", monitoringTier: "A", discoveryWeight: 1, categoryReputation: null, enabled: true, lastEvidenceAt: 0 }];
    const auto = { ...account(1), automationMode: "auto" as const, styleProfile: { categories: ["news", "technology"] } };
    expect(selectPublishingAccount([auto], () => null, source, ["news"], true, [], categories)?.id).toBe(1);
    expect(selectPublishingAccount([auto], () => null, source, ["technology"], true, [], categories)).toBeUndefined();
    expect(selectPublishingAccount([auto], () => null, source, [], true, [], categories)).toBeUndefined();
  });

  test("attributes only an explicitly labelled exclusive source with its visible name", () => {
    const source = { handle: "bpthaber", name: "BPT" } as SourceConfig;
    expect(exclusiveSourceAttribution(source, "ÖZEL HABER: Ankara'da yeni gelişme")).toBe(" (BPT)");
    expect(exclusiveSourceAttribution(source, "Bu özel haber niteliğinde bir gelişme değil.")).toBe("");
    expect(formatSourceAttribution("Başlık ve gelişme", source, "bpthaber", "ÖZEL | Ankara'da yeni gelişme")).toBe("Başlık ve gelişme (BPT)");
    expect(formatSourceAttribution("Başlık ve gelişme", source, "bpthaber", "Ankara'da yeni gelişme")).toBe("Başlık ve gelişme");
    expect(formatSourceAttribution("Başlık", undefined, "brickcenter")).toBe("Başlık");
    expect(qualityGate(post(), "Bu özgün haber özeti yeterince uzun. Kaynak: @brickcenter")).toBeNull();
  });

  test("reconciles a remote write only against its selected account", () => {
    expect(reconciliationMatches({ handle: "one" }, "one", "same", "same")).toBeTrue();
    expect(reconciliationMatches({ handle: "one" }, "two", "same", "same")).toBeFalse();
    expect(reconciliationMatches({ handle: "openai" }, "OPENAI", "same", "same")).toBeTrue();
  });

  test("honors category-level publishing pause without disabling observation", () => {
    expect(categoryPublishingPaused({ publishingPolicy: { paused: true } })).toBeTrue();
    expect(categoryPublishingPaused({ publishingPolicy: {} })).toBeFalse();
  });
});
