import { expect, test } from "bun:test";
import { LOCALES } from "../src/i18n/config";
import { getMathCampaignCopy } from "../src/i18n/math-campaign";

test("math campaign copy is complete and localized for all twenty locales", () => {
  expect(LOCALES).toHaveLength(20);
  for (const locale of LOCALES) {
    const copy = getMathCampaignCopy(locale);
    expect(copy.manifesto, locale).toHaveLength(5);
    expect(copy.features, locale).toHaveLength(4);
    expect(copy.features[0].mathLabel, locale).toBe("ΔE / Δt");
    expect(copy.features[0].formulaLegend, locale).toContain("Δt");
    expect(copy.features[1].formulaLegend, locale).toContain("α");
    expect(copy.features[2].formulaLegend, locale).toContain("q");
    expect(copy.features[3].formulaLegend, locale).toContain("λ");
    expect(copy.features[3].mathLabel, locale).not.toBe("Multi-horizon evaluation");
    expect(copy.experiment.budgetChoices.map(({ value }) => value), locale).toEqual([2, 4]);
    expect(copy.experiment.candidateChoices.map(({ value }) => value), locale).toEqual([3, 6]);
    expect(Object.keys(copy.experiment.outcomes).sort(), locale).toEqual(["2:3", "2:6", "4:3", "4:6"]);
    const text = [copy.eyebrow, copy.headline, copy.statusLabel, copy.statusBody, copy.intro, ...copy.manifesto,
      ...copy.features.flatMap(({ title, body, mathLabel, formulaLegend }) => [title, body, mathLabel, formulaLegend]),
      copy.experiment.title, copy.experiment.body, copy.experiment.prompt, copy.experiment.note,
      copy.experiment.budgetLabel, copy.experiment.candidateLabel,
      ...copy.experiment.budgetChoices.map(({ label }) => label), ...copy.experiment.candidateChoices.map(({ label }) => label),
      ...Object.values(copy.experiment.outcomes).flatMap(({ title, body }) => [title, body]),
      ...copy.limits, copy.closing.title, copy.closing.body, copy.closing.cta];
    expect(text.every((value) => value.trim().length > 0), locale).toBe(true);
    if (locale !== "en") {
      expect(copy.headline, locale).not.toBe(getMathCampaignCopy("en").headline);
      expect(copy.statusLabel, locale).not.toBe(getMathCampaignCopy("en").statusLabel);
      expect(copy.experiment.note, locale).not.toBe(getMathCampaignCopy("en").experiment.note);
    }
  }
});

test("campaign separates planned research from the synthetic decision exercise", () => {
  const english = getMathCampaignCopy("en");
  expect(english.statusLabel).toContain("planned");
  expect(english.statusBody).toContain("not available in Ispatla today");
  expect(english.experiment.note).toContain("no live data");
  expect(english.experiment.note).toContain("no performance prediction");
  expect(english.experiment.outcomes["4:6"].body).toContain("distinct events");
});
