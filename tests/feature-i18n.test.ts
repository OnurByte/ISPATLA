import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES } from "../src/i18n/config";
import { authCopy, authKeys } from "../src/i18n/auth-copy";
import { socialCopy, socialKeys } from "../src/i18n/social-copy";
import { leaderboardCopy, leaderboardKeys } from "../src/i18n/leaderboard-copy";
import { hitSettingsCopy, hitSettingsKeys } from "../src/i18n/hit-settings-copy";
import { AuthForm } from "../src/components/auth-form";
import { ShareActions } from "../src/components/share-actions";
import { LeaderboardContent } from "../src/components/leaderboard-content";
import { HitSharingSettings } from "../src/components/hit-sharing-settings";

test("authentication, sharing and leaderboard have every key in all 20 locales", () => {
  expect(LOCALES).toHaveLength(20);
  for (const [translations, keys] of [
    [authCopy, authKeys], [socialCopy, socialKeys], [leaderboardCopy, leaderboardKeys], [hitSettingsCopy, hitSettingsKeys],
  ] as const) {
    expect(Object.keys(translations).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      const entry = translations[locale];
      expect(Object.keys(entry).sort(), locale).toEqual([...keys].sort());
      expect(Object.values(entry).every(value => typeof value === "string" && value.trim().length > 0), locale).toBe(true);
    }
  }
});

test("all 20 authentication forms render their own locale copy", () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(createElement(AuthForm, { locale, mode: "forgot" }));
    expect(html, locale).toContain(authCopy[locale].forgotTitle);
    expect(html, locale).toContain(authCopy[locale].forgotButton);
    expect(html, locale).toContain(authCopy[locale].email);
  }
});

test("sharing actions render translated copy for every locale", () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(createElement(ShareActions, {
      locale, url: "https://ispatla.tr/h/sample", text: "Evidence", imageUrl: "https://ispatla.tr/h/sample/opengraph-image",
    }));
    expect(html, locale).toContain(socialCopy[locale].copyLink);
    expect(html, locale).toContain(socialCopy[locale].image);
  }
});

test("leaderboard method and tabs have translated copy for each locale", () => {
  const board = { week: [], month: [], accounts: [], improvement: [] };
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(createElement(LeaderboardContent, { locale, tab: "week", board }));
    expect(html, locale).toContain(leaderboardCopy[locale].week);
    expect(html, locale).toContain(leaderboardCopy[locale].method);
    expect(html, locale).toContain(leaderboardCopy[locale].empty);
  }
});

test("selected languages do not silently use Turkish headings", () => {
  for (const locale of LOCALES) {
    if (locale === "tr") continue;
    expect(authCopy[locale].forgotTitle).not.toBe(authCopy.tr.forgotTitle);
    expect(leaderboardCopy[locale].title).not.toBe(leaderboardCopy.tr.title);
    expect(socialCopy[locale].shareProof).not.toBe(socialCopy.tr.shareProof);
  }
});

test("sharing settings offer a translated opt-in explanation for every locale", () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(createElement(HitSharingSettings, { locale, initial: { posts: [], shares: [] } }));
    expect(html, locale).toContain(hitSettingsCopy[locale].title);
    expect(html, locale).toContain(hitSettingsCopy[locale].empty);
    expect(html, locale).toContain(hitSettingsCopy[locale].notice);
  }
});
