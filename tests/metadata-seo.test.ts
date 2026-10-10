import { expect, test } from "bun:test";
import { LOCALES } from "../src/i18n/config";
import { publicMetadata } from "../src/i18n/public-metadata";

test("system-selected public language keeps one flat canonical and matching OG locale", () => {
  for (const locale of LOCALES) {
    const metadata = publicMetadata(locale, "/docs", "Docs", "Localized description");
    const alternates = metadata.alternates?.languages;
    const openGraph = metadata.openGraph;
    const image = Array.isArray(openGraph?.images) ? openGraph.images[0] : openGraph?.images;

    expect(String(metadata.alternates?.canonical)).toBe("https://ispatla.tr/docs");
    expect(alternates).toBeUndefined();
    expect(openGraph?.locale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    expect(openGraph?.alternateLocale).toBeUndefined();
    expect(image).toMatchObject({ url: expect.stringContaining(`/api/og?locale=${locale}`), width: 1200, height: 630, alt: "Docs" });
  }
});
