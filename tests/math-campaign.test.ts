import { expect, test } from "bun:test";
import { LOCALES } from "../src/i18n/config";
import { getMathCampaignCopy } from "../src/i18n/math-campaign";

test("math campaign copy is complete and localized for every supported locale", () => {
  expect(LOCALES).toHaveLength(20);
  for (const locale of LOCALES) {
    const copy = getMathCampaignCopy(locale);
    expect(copy.headline.trim(), locale).toBeTruthy();
    expect(copy.statusBody.trim(), locale).toBeTruthy();
    expect(copy.manifesto, locale).toHaveLength(5);
    expect(copy.features, locale).toHaveLength(4);
    expect(copy.features.map(({ title }) => title).every((value) => value.trim()), locale).toBe(true);
    expect(copy.features.map(({ body }) => body).every((value) => value.trim()), locale).toBe(true);
    expect(copy.features.map(({ mathLabel }) => mathLabel).every((value) => value.trim()), locale).toBe(true);
    expect(copy.features[0].mathLabel, locale).toBe("ΔE / Δt");
    expect(copy.features[3].mathLabel, locale).not.toBe("Multi-horizon evaluation");
    expect(copy.features.map(({ formulaLegend }) => formulaLegend).every((value) => value.trim()), locale).toBe(true);
    expect(copy.experiment.budgetChoices.map(({ value }) => value), locale).toEqual([2, 4]);
    expect(copy.experiment.candidateChoices.map(({ value }) => value), locale).toEqual([3, 6]);
    expect(Object.keys(copy.experiment.outcomes).sort(), locale).toEqual(["2:3", "2:6", "4:3", "4:6"]);
    expect(Object.values(copy.experiment.outcomes).every(({ title, body }) => title.trim() && body.trim()), locale).toBe(true);
    expect(copy.limits, locale).toHaveLength(3);
    const allText = [copy.eyebrow, copy.headline, copy.statusLabel, copy.statusBody, copy.intro, ...copy.manifesto,
      ...copy.features.flatMap(({ title, body, mathLabel, formulaLegend }) => [title, body, mathLabel, formulaLegend]), copy.experiment.title,
      copy.experiment.body, copy.experiment.prompt, copy.experiment.note,
      copy.experiment.budgetLabel, copy.experiment.candidateLabel,
      ...copy.experiment.budgetChoices.map(({ label }) => label), ...copy.experiment.candidateChoices.map(({ label }) => label),
      ...Object.values(copy.experiment.outcomes).flatMap(({ title, body }) => [title, body]),
      ...copy.limits, copy.closing.title, copy.closing.body, copy.closing.cta];
    expect(allText.every((text) => text.trim().length > 0), locale).toBe(true);
    if (locale !== "en") expect(copy.headline, locale).not.toBe(getMathCampaignCopy("en").headline);
  }
});

test("copy frames concepts as planned research and keeps the experiment synthetic", () => {
  for (const locale of LOCALES) {
    const campaign = getMathCampaignCopy(locale);
    if (locale !== "en") {
      expect(campaign.statusLabel, locale).not.toBe(getMathCampaignCopy("en").statusLabel);
      expect(campaign.statusBody, locale).not.toBe(getMathCampaignCopy("en").statusBody);
      expect(campaign.experiment.note, locale).not.toBe(getMathCampaignCopy("en").experiment.note);
    }
    expect(campaign.experiment.note, locale).not.toMatch(/no score or outcome|does not generate/i);
  }
  expect(getMathCampaignCopy("en").statusBody).toContain("not features currently available");
  expect(getMathCampaignCopy("en").experiment.note).toContain("no performance prediction");
  expect(getMathCampaignCopy("en").experiment.outcomes["4:6"].body).toContain("distinct events");
});
