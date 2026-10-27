import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LOCALES, localizePath } from "../src/i18n/config";
import { PUBLIC_ORIGIN, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import { SITE_FAVICON_PATH } from "../src/lib/site-icons";
import { auditPageHtml, auditSitemap, robotsAllows } from "./lib/seo-audit";

// Explicit origin: CI checks its built server; operators may opt into a read-only live audit.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3104").origin;
const failures: string[] = [], images = new Set<string>();
let pages = 0;
async function get(path: string, agent = "Googlebot") {
  const response = await fetch(origin + path, { redirect: "manual", headers: { "user-agent": agent, "accept-language": "en", accept: "text/html,application/xhtml+xml,*/*" }, signal: AbortSignal.timeout(20_000) });
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  if (/\b(noindex|none)\b/i.test(response.headers.get("x-robots-tag") ?? "")) throw new Error(`${path}: X-Robots-Tag blocks indexing`);
  return response;
}
async function bounded<T>(tasks: readonly T[], action: (task: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try { await action(task); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
  }));
}
const robots = await (await get("/robots.txt")).text();
const sitemap = await (await get("/sitemap.xml")).text();
failures.push(...auditSitemap(sitemap, SIGNAL_PRESS_PATHS));
if (!robots.includes(`Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml`)) failures.push("robots.txt has no canonical sitemap");
for (const agent of ["Googlebot", "Googlebot-Image"]) {
  for (const path of ["/", SITE_FAVICON_PATH, "/api/og?locale=en&page=%2F", "/_next/static/test.js"]) {
    if (!robotsAllows(robots, path, agent)) failures.push(`${agent} cannot crawl ${path}`);
  }
}
for (const path of ["/dashboard", "/drafts", "/settings", "/api/drafts"]) {
  if (robotsAllows(robots, path, "Googlebot")) failures.push(`robots.txt no longer excludes ${path}`);
}
const icon = await get(SITE_FAVICON_PATH, "Googlebot-Image");
if (!icon.headers.get("content-type")?.startsWith("image/png")) failures.push("Favicon has an incorrect Content-Type");
const iconBytes = Buffer.from(await icon.arrayBuffer());
if (!iconBytes.equals(readFileSync(`public${SITE_FAVICON_PATH}`))) failures.push("Served favicon differs from the reviewed brand asset");
if (iconBytes.length < 24 || iconBytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || iconBytes.readUInt32BE(16) < 48 || iconBytes.readUInt32BE(16) !== iconBytes.readUInt32BE(20)) failures.push("Favicon must be a square PNG at least 48px");
const fallback = await fetch(origin + "/favicon.ico", { redirect: "follow", signal: AbortSignal.timeout(20_000) });
if (fallback.status !== 200 || !Buffer.from(await fallback.arrayBuffer()).equals(iconBytes)) failures.push("/favicon.ico does not resolve to the same brand icon");

await bounded(SIGNAL_PRESS_PATHS.flatMap(path => LOCALES.flatMap(locale => ["Googlebot", "facebookexternalhit/1.1"].map(agent => ({ path, locale, agent })))), async ({ path, locale, agent }) => {
  const route = localizePath(locale, path);
  const response = await get(route, agent);
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error(`${route}: expected HTML`);
  const html = await response.text();
  const result = await auditPageHtml(html, locale, path);
  for (const error of result.errors) failures.push(`${agent} ${route}: ${error}`);
  if (result.image.startsWith(PUBLIC_ORIGIN + "/api/og?")) images.add(result.image.slice(PUBLIC_ORIGIN.length));
  if (!robotsAllows(robots, route, "Googlebot")) failures.push(`Googlebot cannot crawl ${route}`);
  pages++;
});
await bounded([...images], async path => {
  const response = await get(path, "Googlebot-Image");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get("content-type")?.startsWith("image/png") || bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) failures.push(`${path}: expected a real 1200x630 PNG`);
  if (!robotsAllows(robots, path, "Googlebot-Image")) failures.push(`Googlebot-Image cannot crawl ${path}`);
});
await bounded(LOCALES, async locale => {
  const response = await get(localizePath(locale, "/login"));
  const html = await response.text();
  if (!/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) failures.push(`${locale} auth page has no noindex`);
  const missing = await fetch(origin + localizePath(locale, "/missing-seo-audit-route-9f27"), { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (missing.status !== 404) failures.push(`${locale} unknown route returns ${missing.status}, expected 404`);
});
console.log(JSON.stringify({ origin, pages, socialImages: images.size, locales: LOCALES.length, faviconSha256: createHash("sha256").update(iconBytes).digest("hex"), failures }, null, 2));
if (failures.length) process.exitCode = 1;
