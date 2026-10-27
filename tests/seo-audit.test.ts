import { expect, test } from "bun:test";
import { LOCALES, localizePath } from "@/i18n/config";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";
import { SITE_FAVICON_PATH } from "@/lib/site-icons";
import { auditPageHtml, auditSitemap, robotsAllows } from "../scripts/lib/seo-audit";

const canonical = PUBLIC_ORIGIN + "/";
function pageHtml() {
  return `<html lang="en" dir="ltr"><head><title>ispatla.tr ⁜ Create your next draft</title>
    <meta name="description" content="Find topics that fit your accounts and edit drafts in your own voice.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">
    ${[...LOCALES, "x-default"].map((lang) => `<link rel="alternate" hreflang="${lang}" href="${PUBLIC_ORIGIN}${localizePath(lang === "x-default" ? "en" : lang as typeof LOCALES[number], "/")}">`).join("")}
    <link rel="icon" href="${SITE_FAVICON_PATH}" type="image/png" sizes="180x180">
    <meta property="og:title" content="ispatla.tr ⁜ Create your next draft">
    <meta property="og:description" content="Find topics that fit your accounts and edit drafts in your own voice.">
    <meta property="og:url" content="${canonical}"><meta property="og:site_name" content="ispatla.tr">
    <meta property="og:image" content="${PUBLIC_ORIGIN}/api/og?locale=en&amp;page=%2F">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${PUBLIC_ORIGIN}/api/og?locale=en&amp;page=%2F">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"ispatla.tr","url":"${canonical}"}</script>
    </head><body><main><h1>Drafts with source and reasoning</h1></main></body></html>`;
}
const check = (html: string) => auditPageHtml(html, "en", "/");

test("accepts a crawlable page with one brand icon and reciprocal locale links", async () => {
  expect((await check(pageHtml())).errors).toEqual([]);
});

test("rejects duplicate, missing, incorrect and non-crawlable metadata", async () => {
  for (const [name, html] of [
    ["duplicate canonical", pageHtml().replace("</head>", `<link rel="canonical" href="${canonical}"></head>`)],
    ["wrong canonical", pageHtml().replace(`rel="canonical" href="${canonical}"`, 'rel="canonical" href="https://example.com/"')],
    ["noindex", pageHtml().replace('content="index, follow"', 'content="noindex, follow"')],
    ["missing description", pageHtml().replace(/<meta name="description"[^>]+>/, "")],
    ["duplicate title", pageHtml().replace("</head>", "<title>Duplicate</title></head>")],
    ["wrong language", pageHtml().replace('lang="en"', 'lang="tr"')],
    ["missing h1", pageHtml().replace(/<h1>.*?<\/h1>/, "")],
    ["default favicon", pageHtml().replace(SITE_FAVICON_PATH, "/next.svg")],
    ["data favicon", pageHtml().replace("</head>", '<link rel="icon" href="data:image/png;base64,AAA"></head>')],
    ["missing alternate", pageHtml().replace(/<link rel="alternate" hreflang="tr"[^>]+>/, "")],
    ["duplicate alternate", pageHtml().replace("</head>", `<link rel="alternate" hreflang="tr" href="${PUBLIC_ORIGIN}/tr"></head>`)],
    ["wrong social url", pageHtml().replace('property="og:url"', 'property="og:other"')],
    ["invalid JSON-LD", pageHtml().replace('"@type":"WebSite"', '"@type":BAD')],
    ["wrong site identity", pageHtml().replace('"name":"ispatla.tr"', '"name":"Create Next App"')],
  ]) {
    expect((await check(html)).errors.length, name).toBeGreaterThan(0);
  }
});

test("robots uses the most specific crawler group and longest matching rule, with allow winning ties", () => {
  const robots = 'User-agent: *\nDisallow: /api/\nAllow: /api/og\nDisallow: /*?private=\nUser-agent: Googlebot-Image\nDisallow: /\nAllow: /brand/\n';
  expect(robotsAllows(robots, "/", "Googlebot")).toBe(true);
  expect(robotsAllows(robots, "/api/og?locale=tr", "Googlebot")).toBe(true);
  expect(robotsAllows(robots, "/api/drafts", "Googlebot")).toBe(false);
  expect(robotsAllows(robots, "/?private=1", "Googlebot")).toBe(false);
  expect(robotsAllows(robots, "/brand/ispatla-favicon.png", "Googlebot-Image")).toBe(true);
  expect(robotsAllows(robots, "/other.png", "Googlebot-Image")).toBe(false);
  expect(robotsAllows('User-agent: *\nDisallow: /same\nAllow: /same', "/same", "Googlebot")).toBe(true);
  expect(robotsAllows('User-agent: *\nDisallow: /exact$\n', "/exactly", "Googlebot")).toBe(true);
});

test("sitemap gate rejects missing, extra and duplicate URLs and broken alternate clusters", () => {
  const languages = [...LOCALES, "x-default"].map(lang => `<xhtml:link rel="alternate" hreflang="${lang}" href="${PUBLIC_ORIGIN}${localizePath(lang === "x-default" ? "en" : lang as typeof LOCALES[number], "/")}"/>`).join("");
  const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${LOCALES.map(locale => `<url><loc>${PUBLIC_ORIGIN}${localizePath(locale, "/")}</loc>${languages}</url>`).join("")}</urlset>`;
  expect(auditSitemap(xml, ["/"])).toEqual([]);
  expect(auditSitemap(xml.replace(/<url>.*?<\/url>/, ""), ["/"]).length).toBeGreaterThan(0);
  expect(auditSitemap(xml.replace("</urlset>", `<url><loc>${canonical}</loc>${languages}</url></urlset>`), ["/"]).length).toBeGreaterThan(0);
  expect(auditSitemap(xml.replace('hreflang="tr"', 'hreflang="xx"'), ["/"]).length).toBeGreaterThan(0);
  expect(auditSitemap(xml.replace(`<loc>${canonical}</loc>`, `<loc>${PUBLIC_ORIGIN}/dashboard</loc>`), ["/"]).length).toBeGreaterThan(0);
});

test("robots rules for an unrelated crawler never restrict Googlebot", () => {
  expect(robotsAllows("User-agent: Bingbot\nDisallow: /drafts\n", "/drafts", "Googlebot")).toBe(true);
});

test("URL-equivalent root canonicals from Next's serializer are accepted", async () => {
  expect((await check(pageHtml().replaceAll('"https://ispatla.tr/"', '"https://ispatla.tr"'))).errors).toEqual([]);
});
