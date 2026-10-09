import { expect, test } from "bun:test";
import { publicMetadata, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { LOCALES } from "../src/i18n/config";

test("all twenty translations have self canonical URLs and reciprocal sitemap alternates", () => {
  expect(sitemap()).toHaveLength(SIGNAL_PRESS_PATHS.length * LOCALES.length);
  for (const entry of sitemap()) expect(Object.keys(entry.alternates!.languages!)).toHaveLength(LOCALES.length);
  expect(publicMetadata("ja", "/open-source", "Title", "Description").alternates?.canonical).toBe("https://ispatla.tr/ja/open-source");
  expect(publicMetadata("ja", "/open-source", "Title", "Description").robots).toEqual({ index: true, follow: true });
  expect(publicMetadata("en", "/docs", "Docs", "Setup").alternates?.canonical).toBe("https://ispatla.tr/en/docs");
  expect(robots().rules).toMatchObject({ disallow: expect.arrayContaining(["/api/", "/en/app/", "/tr/reset-password"]) });
});
