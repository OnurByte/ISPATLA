import { describe, expect, test } from "bun:test";
import { LOCALES } from "@/i18n/config";
import { getSignalPressCopy } from "@/i18n/signal-press";
import { estimateMonthlyCost } from "@/components/landing/cost-estimate";
import { splitRevision } from "@/components/landing/signal-experience";

describe("Signal Press landing copy", () => {
  test("keeps the source examples synthetic and includes a rejected candidate", () => {
    for (const locale of LOCALES) {
      const copy = getSignalPressCopy(locale);
      expect(copy.examples.length).toBeGreaterThanOrEqual(3);
      expect(copy.examples.some((example) => example.verdict === "reject")).toBe(true);
      expect(copy.examples.every((example) => example.id && example.source && example.post && example.reason)).toBe(true);
      expect(copy.contentLocale).toBe(locale);
    }
  });

  test("uses distinct Turkish and English product copy and localized existing copy for every other locale", () => {
    const turkish = getSignalPressCopy("tr");
    const english = getSignalPressCopy("en");
    expect(turkish.headline).not.toBe(english.headline);
    for (const locale of LOCALES.filter((item) => item !== "tr" && item !== "en")) {
      const copy = getSignalPressCopy(locale);
      expect(copy.headline).not.toBe(english.headline);
      expect(copy.intro).not.toBe(english.intro);
      expect(copy.detectorTitle).not.toBe(english.detectorTitle);
      expect(copy.examples[0].post).not.toBe(english.examples[0].post);
    }
  });

  test("estimates entered monthly infrastructure and AI costs without allowing negative or unbounded totals", () => {
    expect(estimateMonthlyCost(20, 4, 0.02, 100)).toBeCloseTo(26);
    expect(estimateMonthlyCost(-5, Number.NaN, 1, -2)).toBe(0);
    expect(estimateMonthlyCost(Number.POSITIVE_INFINITY, 0, 0, 1)).toBe(0);
    expect(estimateMonthlyCost(1_000_001, 0, 1_000_001, 1_000_001)).toBe(1_000_000 + 1_000_000 * 1_000_000);
  });

  test("splits a revision into shared, removed and added text without breaking Unicode characters", () => {
    expect(splitRevision("A draft 🙂 is short.", "A revised draft 🙂 is longer.")).toEqual({
      prefix: "A ", removed: "draft 🙂 is short", added: "revised draft 🙂 is longer", suffix: ".",
    });
    expect(splitRevision("same", "same")).toEqual({ prefix: "same", removed: "", added: "", suffix: "" });
  });
});
