import { DEFAULT_LOCALE, LOCALES, LOCALE_CONFIG, localizePath, type Locale } from "../../src/i18n/config";
import { PUBLIC_ORIGIN } from "../../src/i18n/public-metadata";
import { SITE_FAVICON_PATH } from "../../src/lib/site-icons";

const absolute = (path: string) => PUBLIC_ORIGIN + path;
const alternateUrls = (path: string) => new Map([...LOCALES.map(locale => [locale as string, absolute(localizePath(locale, path))] as const), ["x-default", absolute(localizePath(DEFAULT_LOCALE, path))]]);
const sameUrl = (a: string | undefined, b: string | undefined) => { try { return Boolean(a && b) && new URL(a!).href === new URL(b!).href; } catch { return false; } };
const decode = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");

export async function auditPageHtml(html: string, locale: Locale, path: string) {
  const errors: string[] = [];
  const titles: string[] = [], headings: string[] = [];
  const meta = new Map<string, string[]>();
  const canonical: string[] = [], alternates: Array<[string, string]> = [], icons: string[] = [];
  const graphs: unknown[] = [];
  let language = "", direction = "";
  let json = "";
  const rewriter = new HTMLRewriter()
    .on("html", { element(element) { language = element.getAttribute("lang") ?? ""; direction = element.getAttribute("dir") ?? ""; } })
    .on("title", { element() { titles.push(""); }, text(chunk) { titles[titles.length - 1] += chunk.text; } })
    .on("main h1", { element() { headings.push(""); }, text(chunk) { headings[headings.length - 1] += chunk.text; } })
    .on("meta", { element(element) {
      const name = (element.getAttribute("name") || element.getAttribute("property") || "").toLowerCase();
      meta.set(name, [...(meta.get(name) ?? []), element.getAttribute("content") ?? ""]);
    } })
    .on("link", { element(element) {
      const rel = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/), href = element.getAttribute("href") ?? "";
      if (rel.includes("canonical")) canonical.push(href);
      if (rel.includes("alternate") && element.hasAttribute("hreflang")) alternates.push([element.getAttribute("hreflang")!, href]);
      if (rel.includes("icon") && !rel.includes("shortcut")) icons.push(href);
    } })
    .on('script[type="application/ld+json"]', {
      element(element) { json = ""; element.onEndTag(() => { try { graphs.push(JSON.parse(json)); } catch { errors.push("Invalid JSON-LD"); } }); },
      text(chunk) { json += chunk.text; },
    });
  await rewriter.transform(new Response(html)).text();
  const requireOne = (key: string) => {
    const values = meta.get(key) ?? [];
    if (values.length !== 1 || !values[0]?.trim()) errors.push(`Expected one nonempty ${key}`);
    return values[0] ?? "";
  };
  if (language !== locale || direction !== LOCALE_CONFIG[locale].dir) errors.push("Incorrect document language or direction");
  if (titles.length !== 1 || !titles[0]?.trim() || /Create Next App/i.test(titles[0])) errors.push("Expected one meaningful title");
  if (headings.length !== 1 || !headings[0]?.trim()) errors.push("Expected one main h1");
  const description = requireOne("description");
  const robots = [...(meta.get("robots") ?? []), ...(meta.get("googlebot") ?? [])].join(",");
  if (/\b(noindex|none)\b/i.test(robots)) errors.push("Public page is noindex");
  const url = absolute(localizePath(locale, path));
  if (canonical.length !== 1 || !sameUrl(canonical[0], url)) errors.push("Incorrect or duplicate canonical");
  const expected = alternateUrls(path);
  if (alternates.length !== expected.size || alternates.some(([lang, href]) => !sameUrl(expected.get(lang), href)) || new Set(alternates.map(([lang]) => lang)).size !== expected.size) errors.push("Incomplete or incorrect hreflang cluster");
  if (icons.length !== 1 || icons[0] !== SITE_FAVICON_PATH) errors.push("Expected one stable branded favicon URL");
  if (!sameUrl(requireOne("og:url"), url)) errors.push("Open Graph URL differs from canonical");
  if (requireOne("og:site_name") !== "ispatla.tr") errors.push("Incorrect site name");
  if (decode(requireOne("og:title")) !== decode(titles[0] ?? "")) errors.push("Social title differs from page title");
  if (requireOne("og:description") !== description) errors.push("Social description differs from page description");
  if (requireOne("twitter:card") !== "summary_large_image") errors.push("Incorrect Twitter card type");
  const image = requireOne("og:image");
  if (!image.startsWith(`${PUBLIC_ORIGIN}/api/og?`)) errors.push("Incorrect social image origin/path");
  if (requireOne("twitter:image") !== image) errors.push("Twitter image differs from Open Graph image");
  if (path === "/") {
    const nodes = graphs.flatMap(graph => graph && typeof graph === "object" && "@graph" in graph && Array.isArray(graph["@graph"]) ? graph["@graph"] : [graph]);
    const site = nodes.find(node => node && typeof node === "object" && node["@type"] === "WebSite") as Record<string, unknown> | undefined;
    if (!site || site["name"] !== "ispatla.tr" || (typeof site["url"] !== "string" || !sameUrl(site["url"], PUBLIC_ORIGIN + "/"))) errors.push("Missing canonical WebSite identity");
  }
  return { errors, image, robots };
}

/** REP groups, wildcard/end anchors and longest-rule precedence used by Google's crawlers. */
export function robotsAllows(text: string, path: string, agent: string): boolean {
  type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };
  const groups: Group[] = [];
  let current: Group | undefined, hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || hasRules) { current = { agents: [], rules: [] }; groups.push(current); hasRules = false; }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "allow" || field === "disallow")) {
      hasRules = true;
      if (value) current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const specificity = (group: Group) => Math.max(-1, ...group.agents.map(name => name === "*" ? 0 : agent.toLowerCase().includes(name) ? name.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  if (best < 0) return true;
  const matches = groups.filter(group => specificity(group) === best).flatMap(group => group.rules).filter(rule => {
    const end = rule.path.endsWith("$");
    const pattern = (end ? rule.path.slice(0, -1) : rule.path).split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}${end ? "$" : ""}`).test(path);
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

/** Audit the XML emitted by Next's sitemap serializer, without treating it as HTML. */
export function auditSitemap(xml: string, paths: readonly string[]): string[] {
  const errors: string[] = [], seen = new Set<string>();
  const expected = new Map(paths.flatMap(path => LOCALES.map(locale => [absolute(localizePath(locale, path)), path] as const)));
  if (!xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') || !xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) errors.push("Missing sitemap namespaces");
  for (const match of xml.matchAll(/<url>\s*([\s\S]*?)<\/url>/g)) {
    const entry = match[1]!, loc = decode(/<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? ""), path = expected.get(loc);
    if (!path || seen.has(loc)) { errors.push(`Unexpected or duplicate sitemap URL: ${loc}`); continue; }
    seen.add(loc);
    const alternates = [...entry.matchAll(/<xhtml:link\s+([^>]+)\/?\s*>/g)].map(link => {
      const attrs = new Map([...link[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1]!, decode(attr[2]!)]));
      return { lang: attrs.get("hreflang") ?? "", href: attrs.get("href"), rel: attrs.get("rel") };
    });
    const languages = alternateUrls(path);
    if (alternates.length !== languages.size || new Set(alternates.map(link => link.lang)).size !== languages.size || alternates.some(link => link.rel !== "alternate" || languages.get(link.lang) !== link.href)) errors.push(`Incorrect sitemap alternate cluster: ${loc}`);
  }
  if (seen.size !== expected.size) errors.push(`Sitemap has ${seen.size}/${expected.size} expected URLs`);
  return errors;
}
