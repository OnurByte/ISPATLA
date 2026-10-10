import { expect, test } from "bun:test";
import { publicMetadata, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { landingAlternates } from "../src/i18n/metadata";
import { DEFAULT_LOCALE } from "../src/i18n/config";

test("public content uses flat canonical URLs and one sitemap URL per page", () => {
  expect(sitemap()).toHaveLength(10);
  expect(sitemap().map(({ url }) => url)).toEqual([...SIGNAL_PRESS_PATHS, "/terms", "/privacy", "/security", "/leaderboard"].map((path) => `https://ispatla.tr${path}`));
  expect(sitemap().every(({ alternates }) => alternates === undefined)).toBe(true);
  expect(publicMetadata("ja", "/open-source", "Title", "Description").alternates?.canonical).toBe("https://ispatla.tr/open-source");
  expect(publicMetadata("ja", "/open-source", "Title", "Description").robots).toEqual({ index: true, follow: true });
  expect(publicMetadata("en", "/docs", "Docs", "Setup").alternates?.canonical).toBe("https://ispatla.tr/docs");
  expect(landingAlternates()).toEqual({ canonical: "/" });
  expect(DEFAULT_LOCALE).toBe("en");
  expect(robots().rules).toMatchObject({ allow: expect.arrayContaining(["/api/og", "/api/profile/avatar/"]), disallow: expect.arrayContaining(["/api/", "/dashboard"]) });
  expect(robots().rules).toMatchObject({ disallow: expect.not.arrayContaining(["/en/dashboard", "/ja/dashboard", "/login", "/signup", "/reset-password", "/forgot-password"]) });
});
