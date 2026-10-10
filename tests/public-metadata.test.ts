import { expect, test } from "bun:test";
import { publicMetadata, SIGNAL_PRESS_PATHS } from "../src/i18n/public-metadata";
import { LOCALES } from "../src/i18n/config";
import robots from "../src/app/robots";

test("public editorial, legal and ranking pages share flat canonicals across locales", () => {
  expect(SIGNAL_PRESS_PATHS).toHaveLength(10);
  for (const locale of LOCALES) for (const path of SIGNAL_PRESS_PATHS) {
    const metadata = publicMetadata(locale, path, "Title", "Description");
    expect(metadata.alternates).toEqual({ canonical: `https://ispatla.tr${path}` });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  }
});

test("robots keeps public images crawlable and auth noindex readable", () => {
  const rules = robots().rules as { allow: string[]; disallow: string[] };
  expect(rules.allow).toEqual(["/", "/api/og", "/api/profile/avatar/"]);
  expect(rules.disallow).toContain("/api/");
  expect(rules.disallow).toContain("/dashboard");
  for (const path of ["/login", "/signup", "/forgot-password", "/reset-password", "/en/login"]) expect(rules.disallow).not.toContain(path);
});
