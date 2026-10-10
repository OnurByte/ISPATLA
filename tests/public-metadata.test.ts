import { expect, test } from "bun:test";
import { publicMetadata, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

test("localized public pages share clean canonical URLs and one sitemap entry", () => {
  expect(sitemap()).toHaveLength(SIGNAL_PRESS_PATHS.length);
  expect(sitemap().map((entry) => entry.url)).toEqual(SIGNAL_PRESS_PATHS.map((path) => `https://ispatla.tr${path}`));
  expect(publicMetadata("ja", "/open-source", "Title", "Description").alternates).toEqual({ canonical: "https://ispatla.tr/open-source" });
  expect(publicMetadata("ja", "/open-source", "Title", "Description").openGraph?.url).toBe("https://ispatla.tr/open-source");
  expect(publicMetadata("ja", "/open-source", "Title", "Description").openGraph?.images).toMatchObject([{ url: "https://ispatla.tr/api/og?page=%2Fopen-source" }]);
  expect(publicMetadata("ja", "/open-source", "Title", "Description").robots).toEqual({ index: true, follow: true });
  expect(publicMetadata("en", "/docs", "Docs", "Setup").alternates?.canonical).toBe("https://ispatla.tr/docs");
  expect(robots().rules).toMatchObject({ disallow: expect.arrayContaining(["/api/", "/dashboard", "/reset-password"]) });
  expect(JSON.stringify(robots().rules)).not.toContain("/en/dashboard");
});
