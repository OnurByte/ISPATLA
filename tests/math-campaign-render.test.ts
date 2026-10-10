import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, LOCALE_CONFIG } from "../src/i18n/config";
import { getMathCampaignCopy } from "../src/i18n/math-campaign";
import { MathCampaign, MATH_CAMPAIGN_SCENARIOS, mathScenarioKey } from "../src/components/landing/math-campaign";

test("every campaign renders its locale, direction, planned status and initial synthetic explanation", () => {
  for (const locale of LOCALES) {
    const copy = getMathCampaignCopy(locale);
    const markup = renderToStaticMarkup(createElement(MathCampaign, {
      locale, dir: LOCALE_CONFIG[locale].dir, copy, startHref: "/signup",
    }));
    expect(markup).toContain(`lang="${locale}"`);
    expect(markup).toContain(`dir="${LOCALE_CONFIG[locale].dir}"`);
    expect(markup).toContain(copy.statusLabel);
    expect(markup).toContain(copy.experiment.note);
    expect(markup).toContain(copy.experiment.outcomes["2:3"].title);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-labelledby="math-budget-label"');
    expect(markup).toContain('aria-labelledby="math-candidates-label"');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(markup.match(/id="math-formula-\d"/g)).toHaveLength(4);
    expect(markup).toContain("Π(S)");
    expect(markup).toContain("λ(t)");
    expect(copy.features.every((feature) => feature.formulaLegend.trim().length > 10)).toBe(true);
    expect(markup).toContain('href="/signup"');
  }
});

test("each selectable budget and candidate pair has a distinct explanation in every locale", () => {
  for (const locale of LOCALES) {
    const { experiment } = getMathCampaignCopy(locale);
    const explanations = new Set<string>();
    for (const budget of experiment.budgetChoices) {
      for (const candidates of experiment.candidateChoices) {
        const key = mathScenarioKey(budget.value, candidates.value);
        expect(MATH_CAMPAIGN_SCENARIOS.some((scenario) => scenario.key === key)).toBe(true);
        explanations.add(experiment.outcomes[key].body);
      }
    }
    expect(explanations.size, locale).toBe(4);
  }
});
