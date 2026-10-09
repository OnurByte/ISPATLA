import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES } from "../src/i18n/config";
import { publicEvidenceCopy } from "../src/i18n/public-evidence-copy";
import { getSignalPressCopy } from "../src/i18n/signal-press";
import { EXCUSE_CAMPAIGN } from "../src/i18n/excuse-campaign";
import { getDictionary } from "../src/i18n/dictionaries";
import { GrowthScene, GROWTH_DEMO, growthPlot } from "../src/components/landing/growth-scene";
import { ExcuseBurner } from "../src/components/landing/excuse-burner";

test("growth demo periods produce different finite plots and the campaign offers real next steps", () => {
  const paths = new Set<string>();
  for (const sample of Object.values(GROWTH_DEMO)) {
    const plot = growthPlot(sample.points);
    paths.add(plot.line);
    expect(plot.coordinates.every(([x, y]) => Number.isFinite(x) && y >= 0 && y <= 235)).toBe(true);
    expect(plot.area).toEndWith("V235 H35Z");
  }
  expect(paths.size).toBe(3);
  expect(Object.keys(EXCUSE_CAMPAIGN).sort()).toEqual([...LOCALES].sort());
  for (const locale of LOCALES) {
    const campaign = EXCUSE_CAMPAIGN[locale];
    const markup = renderToStaticMarkup(createElement(ExcuseBurner, { locale, startHref: `/${locale}/signup` }));
    expect(markup).toContain(campaign.title);
    expect(markup).toContain(`lang="${locale}"`);
    expect(markup).not.toContain("Kanıt odası");
    expect(campaign.title.trim().length, locale).toBeGreaterThan(10);
    expect(campaign.intro.trim().length, locale).toBeGreaterThan(30);
    expect([campaign.action, campaign.reset, campaign.hint, campaign.label].every((value) => value.trim().length > 2), locale).toBe(true);
    expect(campaign.choices).toHaveLength(3);
    expect(campaign.choices.every((choice) => Array.from(choice.excuse.trim()).length > 5 && Array.from(choice.response.trim()).length > 30), locale).toBe(true);
    expect(getDictionary(locale).nav.appearance.trim().length, locale).toBeGreaterThan(2);
  }
});

test("all twenty languages have complete public pages without the synthetic growth badge", () => {
  expect(Object.keys(publicEvidenceCopy).sort()).toEqual([...LOCALES].sort());
  for (const locale of LOCALES) {
    const copy = getSignalPressCopy(locale);
    const evidence = publicEvidenceCopy[locale];
    for (const page of Object.values(evidence.pages)) {
      expect(page.title.trim().length, locale).toBeGreaterThan(5);
      expect(page.description.trim().length, locale).toBeGreaterThan(10);
      expect(page.sections.length, locale).toBeGreaterThanOrEqual(2);
      expect(page.sections.every((section) => section.heading && section.body), locale).toBe(true);
    }
    expect(evidence.complaintSummary).toHaveLength(3);
    expect(evidence.complaintResponse).toHaveLength(3);
    expect(copy.examples.map((example) => example.score)).toEqual([72, 18, 64]);
    const markup = renderToStaticMarkup(createElement(GrowthScene, { locale, copy }));
    expect(markup).toContain('id="growth-scene-title"');
    expect(markup).not.toContain(copy.synthetic);
    expect(markup).not.toContain("SuperX");
    expect(markup).not.toContain("competitor-comparison");
  }
});
