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

test("locale path helpers keep clean paths and strip legacy locale prefixes", () => {
  expect(isLocale("ar")).toBe(true);
  expect(isLocale("not-a-locale")).toBe(false);
  expect(localeFromPath("/zh-CN/settings")).toBe("zh-CN");
  expect(localeFromPath("/settings")).toBeNull();
  expect(stripLocalePrefix("/zh-CN/settings")).toBe("/settings");
  expect(localizePath("en", "/settings?tab=profile")).toBe("/settings?tab=profile");
  expect(localizePath("tr", "/en")).toBe("/");
  expect(localizePath("tr", "/")).toBe("/");
  expect(localizePath("tr", "/accounts")).toBe("/accounts");
  expect(localizePath("en", "/accounts")).toBe("/accounts");
});

test("system language matching honors browser preference order and supported language fallbacks", () => {
  expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
  expect(localeFromAcceptLanguage("ar-EG,en-US;q=0.8")).toBe("ar");
  expect(localeFromAcceptLanguage("pt,en;q=0.7")).toBe("pt-BR");
  expect(localeFromAcceptLanguage("xx, *;q=0.5")).toBeNull();
  expect(localeFromAcceptLanguage("tr;q=0,en;q=1")).toBe("en");
});

test("landing metadata uses a clean canonical path without duplicate hreflang URLs", () => {
  const metadata = landingAlternates("zh-CN");
  expect(metadata).toEqual({ canonical: "/" });
});

test("proxy redirects legacy locale URLs, remembers language choice, protects app routes, and leaves API callbacks flat", () => {
  const defaultLocaleCanonical = proxy(new Request("http://localhost:3000/tr/privacy?tab=connections"));
  expect(defaultLocaleCanonical.status).toBe(307);
  expect(defaultLocaleCanonical.headers.get("location")).toBe("http://localhost:3000/privacy?tab=connections");
  expect(defaultLocaleCanonical.headers.get("set-cookie")).toContain("ispatla-locale=tr");

  const localized = proxy(new Request("http://localhost:3000/ar/privacy?from=mail"));
  expect(localized.status).toBe(307);
  expect(localized.headers.get("location")).toBe("http://localhost:3000/privacy?from=mail");
  expect(localized.headers.get("set-cookie")).toContain("ispatla-locale=ar");

  const protectedPage = proxy(new Request("http://localhost:3000/en/settings/profile"));
  expect(protectedPage.status).toBe(307);
  expect(protectedPage.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fsettings%2Fprofile");
  expect(protectedPage.headers.get("set-cookie")).toContain("ispatla-locale=en");

  const protectedDashboard = proxy(new Request("http://localhost:3000/dashboard?tab=recent"));
  expect(protectedDashboard.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fdashboard%3Ftab%3Drecent");
  const validSessionRoute = proxy(new Request("http://localhost:3000/dashboard", { headers: { cookie: "better-auth.session_token=present" } }));
  expect(validSessionRoute.status).toBe(200);
  expect(validSessionRoute.headers.get("location")).toBeNull();
  expect(validSessionRoute.headers.get("x-middleware-rewrite")).toBeNull();
  const localizedDashboard = proxy(new Request("http://localhost:3000/en/dashboard", { headers: { cookie: "better-auth.session_token=present" } }));
  expect(localizedDashboard.headers.get("location")).toBe("http://localhost:3000/dashboard");
  expect(localizedDashboard.headers.get("set-cookie")).toContain("ispatla-locale=en");
  const unsupportedLegacyDashboard = proxy(new Request("http://localhost:3000/app/dashboard"));
  expect(unsupportedLegacyDashboard.status).toBe(200);
  expect(unsupportedLegacyDashboard.headers.get("location")).toBeNull();
  const publicDynamicPages = ["/username", "/h/012345678901234567890123", "/u/012345678901234567890123"];
  for (const path of publicDynamicPages) expect(proxy(new Request(`http://localhost:3000${path}`)).status, path).toBe(200);

  const callback = proxy(new Request("http://localhost:3000/api/auth/callback/x"));
  expect(callback.headers.get("x-middleware-rewrite")).toBeNull();
  expect(callback.headers.get("location")).toBeNull();
  const localizedCallback = proxy(new Request("http://localhost:3000/en/api/auth/callback/x?code=abc"));
  expect(localizedCallback.headers.get("location")).toBe("http://localhost:3000/api/auth/callback/x?code=abc");

  const unknownNestedRoute = proxy(new Request("http://localhost:3000/fr/this-route/does-not-exist"));
  expect(unknownNestedRoute.status).toBe(307);
  expect(unknownNestedRoute.headers.get("location")).toBe("http://localhost:3000/this-route/does-not-exist");
  for (const path of ["/dashboard/unknown", "/settings/unknown"]) {
    const unknownPrivateChild = proxy(new Request(`http://localhost:3000${path}`));
    expect(unknownPrivateChild.status, path).toBe(200);
    expect(unknownPrivateChild.headers.get("location"), path).toBeNull();
  }

  const selectedLanguage = proxy(new Request("http://localhost:3000/privacy", { headers: { "accept-language": "ja-JP,en;q=0.8", cookie: "ispatla-locale=fr" } }));
  expect(selectedLanguage.headers.get("x-middleware-request-x-ispatla-locale")).toBe("fr");
  const remembered = proxy(new Request("http://localhost:3000/privacy", { headers: { cookie: "better-auth.session_token=valid; ispatla-locale=ja" } }));
  expect(remembered.headers.get("x-middleware-request-x-ispatla-locale")).toBe("ja");
  const explicitWins = proxy(new Request("http://localhost:3000/en/privacy", { headers: { cookie: "ispatla-locale=ja" } }));
  expect(explicitWins.headers.get("location")).toBe("http://localhost:3000/privacy");
  expect(explicitWins.headers.get("set-cookie")).toContain("ispatla-locale=en");
  const invalidCookie = proxy(new Request("http://localhost:3000/privacy", { headers: { cookie: "ispatla-locale=../../api" } }));
  expect(invalidCookie.headers.get("x-middleware-request-x-ispatla-locale")).toBe("tr");
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
