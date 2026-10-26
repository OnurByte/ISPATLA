import { expect, test } from "bun:test";
import { publicMetadata, normalizeMetadataText, OPEN_GRAPH_LOCALES, PUBLIC_ORIGIN, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { DEFAULT_LOCALE, LOCALES, localizePath } from "../src/i18n/config";

test("all twenty locales have self canonicals and complete reciprocal hreflang metadata", () => {
  for (const path of SIGNAL_PRESS_PATHS) {
    for (const locale of LOCALES) {
      const metadata = publicMetadata(locale, path, "Title · Part — Name", "Description · Part — Name");
      const canonical = `${PUBLIC_ORIGIN}${localizePath(locale, path)}`;
      const alternates = metadata.alternates?.languages;
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(Object.keys(alternates ?? {}).sort()).toEqual([...LOCALES, "x-default"].sort());
      for (const alternateLocale of LOCALES) {
        expect(alternates?.[alternateLocale]).toBe(`${PUBLIC_ORIGIN}${localizePath(alternateLocale, path)}`);
      }
      expect(alternates?.["x-default"]).toBe(`${PUBLIC_ORIGIN}${localizePath(DEFAULT_LOCALE, path)}`);
      const oEmbedDiscovery = metadata.alternates?.types?.["application/json+oembed"];
      expect(oEmbedDiscovery).toBe(`${PUBLIC_ORIGIN}/oembed.json?${new URLSearchParams({ url: canonical, format: "json" })}`);
      expect(metadata.robots).toEqual({ index: true, follow: true });

      const openGraph = metadata.openGraph!;
      const twitter = metadata.twitter!;
      expect(openGraph.locale).toBe(OPEN_GRAPH_LOCALES[locale]);
      expect(openGraph.siteName).toBe("ispatla.tr");
      expect(openGraph.alternateLocale).toHaveLength(LOCALES.length - 1);
      expect(openGraph.url).toBe(canonical);
      expect(openGraph.title).toBe("Title ⁜ Part ⁜ Name");
      expect(openGraph.description).toBe("Description ⁜ Part ⁜ Name");
      expect(twitter.title).toBe(openGraph.title);
      expect(twitter.description).toBe(openGraph.description);

      const ogImage = openGraph.images as Array<{ url: string | URL; secureUrl: string | URL; type: string; width: number; height: number; alt: string }>;
      const twitterImages = twitter.images as Array<{ url: string | URL; alt: string }>;
      expect(ogImage).toHaveLength(1);
      expect(twitterImages).toHaveLength(1);
      for (const image of [ogImage[0]!, twitterImages[0]!]) {
        const imageUrl = new URL(image.url);
        expect(imageUrl.origin).toBe(PUBLIC_ORIGIN);
        expect(imageUrl.pathname).toBe("/api/og");
        expect(imageUrl.searchParams.get("locale")).toBe(locale);
        expect(imageUrl.searchParams.get("page")).toBe(path);
        expect(image.alt).toBe("Title ⁜ Part ⁜ Name");
      }
      expect(ogImage[0]!.secureUrl).toBe(ogImage[0]!.url);
      expect(ogImage[0]!.type).toBe("image/png");
      expect(ogImage[0]!.width).toBe(1200);
      expect(ogImage[0]!.height).toBe(630);
    }
  }
});

test("sitemap contains only the public locale routes with matching language alternates", () => {
  const entries = sitemap();
  expect(entries).toHaveLength(SIGNAL_PRESS_PATHS.length * LOCALES.length);
  const urls = new Set(entries.map((entry) => entry.url));
  expect(urls.size).toBe(entries.length);
  for (const path of SIGNAL_PRESS_PATHS) {
    for (const locale of LOCALES) {
      const url = `${PUBLIC_ORIGIN}${localizePath(locale, path)}`;
      const entry = entries.find((candidate) => candidate.url === url);
      expect(entry).toBeDefined();
      expect(Object.keys(entry?.alternates?.languages ?? {}).sort()).toEqual([...LOCALES, "x-default"].sort());
      expect(entry?.alternates?.languages?.["x-default"]).toBe(`${PUBLIC_ORIGIN}${localizePath(DEFAULT_LOCALE, path)}`);
    }
  }
  for (const entry of entries) {
    expect(entry.url).not.toMatch(/\/(?:login|signup|reset-password|dashboard|settings|api)(?:\/|$)/u);
  }
});

test("robots allows the public OG image and disallows private pages and API endpoints", () => {
  const rule = robots().rules;
  if (Array.isArray(rule)) throw new Error("Expected one robots rule");
  expect(rule.allow).toContain("/api/og");
  expect(rule.disallow).toContain("/api/");
  for (const path of ["/login", "/signup", "/forgot-password", "/reset-password", "/dashboard", "/accounts", "/drafts", "/settings", "/mcp"]) {
    expect(rule.disallow).toContain(path);
    for (const locale of LOCALES.filter((item) => item !== DEFAULT_LOCALE)) {
      expect(rule.disallow).toContain(`/${locale}${path}`);
    }
  }
  expect(robots().sitemap).toBe(`${PUBLIC_ORIGIN}/sitemap.xml`);
});

test("metadata text replaces middle dots and long dashes with the brand separator", () => {
  expect(normalizeMetadataText(" One · Two — Three – Four ")).toBe("One ⁜ Two ⁜ Three ⁜ Four");
});
