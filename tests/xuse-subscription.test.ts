import { expect, test } from "bun:test";
import { normaliseXUseSubscription } from "@/server/xuse";

test("normalizes only timestamped x-use subscription history", () => {
  expect(normaliseXUseSubscription({ handle: "@Publisher", current_tier: "Premium+", observed_at: 500, history: [
    { tier: "free", effective_at: 100 },
    { tier: "premium", effective_at: 200 },
    { tier: "basic", effective_at: 800 },
  ] }, 600)).toEqual({
    handle: "publisher",
    tier: "premium_plus",
    observedAt: 500,
    history: [{ tier: "free", effectiveAt: 100 }, { tier: "premium", effectiveAt: 200 }],
    historyComplete: false,
  });
  expect(normaliseXUseSubscription({ current_tier: "not-a-tier" }, 600)).toBeNull();
  expect(normaliseXUseSubscription({ handle: "@OPENAI", current_tier: "free" }, 600)?.handle).toBe("openai");
});
