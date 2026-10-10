import { expect, test } from "bun:test";
import { dictionaries } from "../src/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALES, LOCALE_CONFIG, isLocale, localeFromAcceptLanguage, localeFromPath, localizePath, stripLocalePrefix } from "../src/i18n/config";
import { landingAlternates } from "../src/i18n/metadata";
import { proxy } from "../src/proxy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicHeaderContent } from "../src/components/public-header";
import { LocaleSwitcher } from "../src/i18n/locale-switcher";

test("all locale choices carry flags and the themed Select names its current language accessibly", () => {
  for (const locale of LOCALES) {
    expect(LOCALE_CONFIG[locale].flag).toMatch(/^[\u{1F1E6}-\u{1F1FF}]{2}$/u);
    const markup = renderToStaticMarkup(createElement(LocaleSwitcher, { locale }));
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).not.toContain("<select");
    expect(markup).toContain(`aria-label="${dictionaries[locale].nav.language}"`);
    expect(markup).toContain(LOCALE_CONFIG[locale].nativeName);
    expect(markup).toContain(`<span aria-hidden="true" class="shrink-0">${LOCALE_CONFIG[locale].flag}</span>`);
    expect(markup).toContain("bg-popover text-popover-foreground");
  }
});

test("all twenty locales have complete, translated navigation and landing dictionaries", () => {
  expect(LOCALES).toHaveLength(20);
  expect(LOCALES).toEqual(["en", "zh-CN", "hi", "es", "fr", "ar", "bn", "pt-BR", "ru", "id", "ur", "de", "ja", "sw", "mr", "te", "tr", "ta", "vi", "ko"]);
  expect(Object.keys(dictionaries).sort()).toEqual([...LOCALES].sort());
  const flatten = (value: unknown, prefix = ""): string[] => {
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
    }
    return [prefix];
  };
  const baseline = flatten(dictionaries[DEFAULT_LOCALE]).sort();
  for (const locale of LOCALES) {
    const dictionary = dictionaries[locale];
    expect(flatten(dictionary).sort(), locale).toEqual(baseline);
    expect(Object.values(dictionary.nav).every((text) => text.trim().length > 0), `${locale} navigation`).toBe(true);
    expect(Object.entries(dictionary.landing).every(([key, text]) => key === "partialNotice" ? text === "" : text.trim().length > 0), `${locale} landing`).toBe(true);
    expect(dictionary.status.partial.trim().length, `${locale} partial status`).toBeGreaterThan(0);
    expect(dictionary.landing.partialNotice, `${locale} localized landing notice`).toBe("");
    if (locale !== "en") {
      expect(dictionary.nav.login, `${locale} sign-in label`).not.toBe(dictionaries.en.nav.login);
      expect(dictionary.landing.headlineFirst, `${locale} landing headline`).not.toBe(dictionaries.en.landing.headlineFirst);
      expect(dictionary.status.partial, `${locale} status translation`).not.toBe(dictionaries.en.status.partial);
    }
  }
  expect(dictionaries["zh-CN"].landing.headlineFirst).toBe("别再讨好算法。");
  expect(dictionaries.hi.nav.login).toBe("साइन इन");
  expect(dictionaries.es.landing.headlineSecond).toBe("Haz que tu próximo paso cuente.");
  expect(dictionaries.ar.nav.login).toBe("تسجيل الدخول");
  expect(dictionaries.ur.landing.headlineSecond).toBe("اپنے اگلے قدم کو معنی دیں۔");
  expect(dictionaries.sw.landing.headlineFirst).toBe("Acha kuisihi algoriti.");
  expect(dictionaries.ta.nav.login).toBe("உள்நுழை");
  expect(dictionaries.tr.landing.headlineSecond).toBe("Kendi oyununu kur.");
  expect(LOCALE_CONFIG.ar.dir).toBe("rtl");
  expect(LOCALE_CONFIG.ur.dir).toBe("rtl");
  expect(LOCALE_CONFIG["zh-CN"].nativeName).toBe("简体中文");
  expect(LOCALE_CONFIG["pt-BR"].nativeName).toBe("Português (Brasil)");
  expect(LOCALE_CONFIG.en.dir).toBe("ltr");
});

test("locale path helpers keep clean paths and safely remove legacy locale prefixes", () => {
  expect(DEFAULT_LOCALE).toBe("en");
  expect(isLocale("ar")).toBe(true);
  expect(isLocale("not-a-locale")).toBe(false);
  expect(localeFromPath("/zh-CN/settings")).toBe("zh-CN");
  expect(localeFromPath("/settings")).toBeNull();
  expect(stripLocalePrefix("/zh-CN/settings")).toBe("/settings");
  expect(localizePath("en", "/settings?tab=profile#security")).toBe("/settings?tab=profile#security");
  expect(localizePath("tr", "/en?tab=profile#security")).toBe("/?tab=profile#security");
  expect(localizePath("tr", "/")).toBe("/");
  expect(localizePath("tr", "/accounts")).toBe("/accounts");
  for (const locale of LOCALES) expect(localizePath(locale, "/zh-CN/accounts?tab=profile")).toBe("/accounts?tab=profile");
});

test("system language matching honors browser preference order and supported language fallbacks", () => {
  expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  expect(localeFromAcceptLanguage("ar-EG,en-US;q=0.8")).toBe("ar");
  expect(localeFromAcceptLanguage("pt,en;q=0.7")).toBe("pt-BR");
  expect(localeFromAcceptLanguage("xx, *;q=0.5")).toBeNull();
  expect(localeFromAcceptLanguage("tr;q=0,en;q=1")).toBe("en");
});

test("clean landing metadata uses one stable canonical path", () => {
  const metadata = landingAlternates();
  expect(metadata).toEqual({ canonical: "/" });
});

test("proxy redirects legacy locale paths, resolves locale preferences, and leaves auth/API/static boundaries intact", () => {
  for (const locale of LOCALES) {
    const legacy = proxy(new Request(`http://localhost:3000/${locale}/docs?from=mail`));
    expect(legacy.status, locale).toBe(308);
    expect(legacy.headers.get("location"), locale).toBe("http://localhost:3000/docs?from=mail");
    expect(legacy.headers.get("set-cookie"), locale).toContain(`ispatla-locale=${locale}`);
  }

  const protectedPage = proxy(new Request("http://localhost:3000/dashboard?tab=recent", { headers: { cookie: "ispatla-locale=fr" } }));
  expect(protectedPage.status).toBe(307);
  expect(protectedPage.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdashboard%3Ftab%3Drecent");
  const privateCookieWins = proxy(new Request("http://localhost:3000/dashboard", { headers: { cookie: "better-auth.session_token=present; ispatla-locale=fr", "accept-language": "ja" } }));
  expect(privateCookieWins.headers.get("x-middleware-request-x-ispatla-locale")).toBe("fr");
  const privateSystemLocale = proxy(new Request("http://localhost:3000/dashboard", { headers: { cookie: "better-auth.session_token=present", "accept-language": "ja-JP,en;q=0.8" } }));
  expect(privateSystemLocale.status).toBe(200);
  expect(privateSystemLocale.headers.get("x-middleware-request-x-ispatla-locale")).toBe("ja");

  const publicSystemLocale = proxy(new Request("http://localhost:3000/docs", { headers: { cookie: "ispatla-locale=fr", "accept-language": "tr-TR,en;q=0.8" } }));
  expect(publicSystemLocale.headers.get("x-middleware-request-x-ispatla-locale")).toBe("tr");
  const publicIgnoresCookie = proxy(new Request("http://localhost:3000/docs", { headers: { cookie: "ispatla-locale=fr", "accept-language": "ja" } }));
  expect(publicIgnoresCookie.headers.get("x-middleware-request-x-ispatla-locale")).toBe("ja");
  const defaultEnglish = proxy(new Request("http://localhost:3000/docs", { headers: { cookie: "ispatla-locale=tr", "accept-language": "xx, *;q=0.5" } }));
  expect(defaultEnglish.headers.get("x-middleware-request-x-ispatla-locale")).toBe("en");
  const invalidPrivateCookie = proxy(new Request("http://localhost:3000/dashboard", { headers: { cookie: "better-auth.session_token=present; ispatla-locale=../../api", "accept-language": "fr" } }));
  expect(invalidPrivateCookie.headers.get("x-middleware-request-x-ispatla-locale")).toBe("fr");

  for (const path of ["/api/auth/callback/x", "/_next/static/chunk.js", "/brand/ispatla-symbol.png"]) {
    const untouched = proxy(new Request(`http://localhost:3000${path}`));
    expect(untouched.headers.get("location"), path).toBeNull();
    expect(untouched.headers.get("x-middleware-request-x-ispatla-locale"), path).toBeNull();
  }
  for (const path of ["/username", "/h/012345678901234567890123", "/u/012345678901234567890123"]) {
    const response = proxy(new Request(`http://localhost:3000${path}`, { headers: { cookie: "ispatla-locale=fr", "accept-language": "ar" } }));
    expect(response.status, path).toBe(200);
    expect(response.headers.get("x-middleware-request-x-ispatla-locale"), path).toBe("ar");
  }
});


test("public product-tour navigation shares the brand and preserves every locale", () => {
  for (const locale of LOCALES) {
    const markup = renderToStaticMarkup(createElement(PublicHeaderContent, { locale, current: "docs", authenticated: false }));
    expect(markup).toContain("ispatla.tr");
    expect(markup).toContain("/brand/ispatla-symbol.png");
    expect(markup).toContain(`href="${localizePath(locale, "/")}"`);
    for (const route of ["/docs", "/login", "/signup"]) expect(markup).toContain(`href="${localizePath(locale, route)}"`);
    const tourLink = markup.match(/<a\b[^>]*>/g)?.find((tag) => tag.includes(`href="${localizePath(locale, "/docs")}"`));
    expect(tourLink).toContain('aria-current="page"');
    expect(markup).not.toContain('data-slot="select-trigger"');
    const authenticatedMarkup = renderToStaticMarkup(createElement(PublicHeaderContent, { locale, authenticated: true }));
    expect(authenticatedMarkup).toContain(dictionaries[locale].nav.dashboard);
    expect(authenticatedMarkup).toContain(`href="${localizePath(locale, "/dashboard")}"`);
    expect(authenticatedMarkup).not.toContain(dictionaries[locale].nav.signOut);
    expect(authenticatedMarkup).not.toContain(`href="${localizePath(locale, "/signup")}"`);
  }
});
