import { expect, test } from "bun:test";
import { GET } from "../src/app/oembed.json/route";
import { getCampaignLandingCopy } from "../src/i18n/campaign-landing";
import { LOCALES, localizePath, type Locale } from "../src/i18n/config";
import { docsCopy } from "../src/i18n/docs-copy";
import { publicEvidencePageCopy } from "../src/i18n/public-evidence-copy";
import { PUBLIC_ORIGIN, publicMetadata, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";

function pageCopy(locale: Locale, path: (typeof SIGNAL_PRESS_PATHS)[number]) {
  if (path === "/") {
    const copy = getCampaignLandingCopy(locale);
    return { title: `${copy.headline} ${copy.headlineAccent} ⁜ ispatla.tr`, description: copy.intro };
  }
  if (path === "/docs") {
    const copy = docsCopy[locale];
    return { title: copy.metaTitle, description: copy.metaDescription };
  }
  return publicEvidencePageCopy(locale, path);
}

test("oEmbed discovery and responses match every supported locale and public landing page", async () => {
  for (const path of SIGNAL_PRESS_PATHS) {
    for (const locale of LOCALES) {
      const canonical = `${PUBLIC_ORIGIN}${localizePath(locale, path)}`;
      const metadata = publicMetadata(locale, path, "Title", "Description");
      const discovery = metadata.alternates?.types?.["application/json+oembed"];
      expect(discovery).toBe(`${PUBLIC_ORIGIN}/oembed.json?${new URLSearchParams({ url: canonical, format: "json" })}`);

      const query = new URLSearchParams({ url: canonical, format: "json" });
      const response = await GET(new Request(`http://localhost/oembed.json?${query}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
      const payload = await response.json();
      const content = pageCopy(locale, path);
      const expected = publicMetadata(locale, path, content.title, content.description);
      expect(payload).toMatchObject({
        version: "1.0",
        type: "link",
        provider_name: "ispatla.tr",
        provider_url: PUBLIC_ORIGIN,
        author_name: "ispatla.tr",
        author_url: PUBLIC_ORIGIN,
        title: expected.title,
        description: expected.description,
        thumbnail_url: `${PUBLIC_ORIGIN}/api/og?${new URLSearchParams({ locale, page: path })}`,
        thumbnail_width: 1200,
        thumbnail_height: 630,
      });
    }
  }
});

test("oEmbed rejects malformed, external, credentialed, private, and unsupported URLs", async () => {
  const invalidTargets = [
    { value: "not a URL", status: 400 },
    { value: "https://example.org/", status: 404 },
    { value: "http://localhost:3000/", status: 404 },
    { value: "https://user:secret@ispatla.tr/", status: 404 },
    { value: "https://ispatla.tr/login", status: 404 },
    { value: "https://ispatla.tr/en/dashboard", status: 404 },
    { value: "https://ispatla.tr/oembed.json", status: 404 },
    { value: "https://ispatla.tr/?source=untrusted", status: 404 },
    { value: "https://ispatla.tr/#private", status: 404 },
  ];
  for (const { value, status } of invalidTargets) {
    const query = new URLSearchParams({ url: value });
    const response = await GET(new Request(`http://localhost/oembed.json?${query}`));
    expect(response.status).toBe(status);
  }

  const missingUrl = await GET(new Request("http://localhost/oembed.json?format=json"));
  expect(missingUrl.status).toBe(400);
  const duplicateUrl = await GET(new Request("http://localhost/oembed.json?url=https%3A%2F%2Fispatla.tr%2F&url=https%3A%2F%2Fexample.org%2F"));
  expect(duplicateUrl.status).toBe(400);
  const unsupportedFormat = await GET(new Request("http://localhost/oembed.json?url=https%3A%2F%2Fispatla.tr%2F&format=xml"));
  expect(unsupportedFormat.status).toBe(501);
});
