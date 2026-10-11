import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES, LOCALE_CONFIG } from "../src/i18n/config";
import { MathCampaign, MATH_CAMPAIGN_SCENARIOS, mathScenarioKey } from "../src/components/landing/math-campaign";
import { getMathCampaignCopy } from "../src/i18n/math-campaign";

test("renders the planned campaign, localized legends and formula controls in all locales", () => {
  for (const locale of LOCALES) {
    const copy = getMathCampaignCopy(locale);
    const markup = renderToStaticMarkup(createElement(MathCampaign, {
      locale, dir: LOCALE_CONFIG[locale].dir, copy, startHref: `/${locale}/signup`,
    }));
    expect(markup).toContain(`lang="${locale}"`);
    expect(markup).toContain(`dir="${LOCALE_CONFIG[locale].dir}"`);
    expect(markup).toContain(copy.statusBody);
    expect(markup).toContain(copy.experiment.note);
    expect(markup).toContain(copy.experiment.outcomes["2:3"].title);
    expect(markup.match(/math-formula-\d/g)?.length).toBeGreaterThanOrEqual(8);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('href="/' + locale + '/signup"');
  }
});

test("the four scan settings map to their own explanation for every locale", () => {
  for (const locale of LOCALES) {
    const experiment = getMathCampaignCopy(locale).experiment;
    for (const budget of experiment.budgetChoices) for (const pool of experiment.candidateChoices) {
      const key = mathScenarioKey(budget.value, pool.value);
      expect(MATH_CAMPAIGN_SCENARIOS.some((scenario) => scenario.key === key)).toBe(true);
      expect(experiment.outcomes[key].body.trim().length, locale).toBeGreaterThan(20);
    }
  }
});
