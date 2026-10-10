import { expect, test } from "bun:test";
import { compactOfficialMetric, publicShareUrl, publicSocialImageUrl, socialShareTargets } from "../src/lib/social-sharing";
import { ogFontNames } from "../src/server/og-fonts";

test("public share and image URLs are same-origin", () => {
  expect(publicShareUrl("/h/abc")).toBe("https://ispatla.tr/h/abc");
  expect(publicSocialImageUrl("/h/abc")).toBe("https://ispatla.tr/h/abc/opengraph-image");
  for (const path of ["//evil.example/path", "http://evil.example", "/\\evil.example", "\nhttps://other.example"]) {
    expect(() => publicShareUrl(path)).toThrow();
  }
  expect(() => publicSocialImageUrl("/h/abc?cache=1")).toThrow();
});

test("share destinations retain the proof URL and multilingual text", () => {
  const url = publicShareUrl("/h/abc");
  const targets = socialShareTargets(url, "Resmî gözlem — اختبار");
  expect(targets).toHaveLength(4);
  for (const target of targets) {
    expect(new URL(target.href).protocol).toBe("https:");
    expect(decodeURIComponent(target.href)).toContain(url);
  }
});

test("unknown official observations are not transformed into zero", () => {
  expect(compactOfficialMetric(null)).toBe("—");
  expect(compactOfficialMetric(0)).not.toBe("—");
});

test("the OG card loads local fonts for supported writing systems", () => {
  expect(ogFontNames("Türkçe")).toEqual(["latin", "math"]);
  expect(ogFontNames("مرحبا")).toContain("arabic");
  expect(ogFontNames("বাংলা")).toContain("bengali");
  expect(ogFontNames("日本語 한국어 中文")).toContain("cjk");
  expect(ogFontNames("हिन्दी")).toContain("devanagari");
  expect(ogFontNames("தமிழ்")).toContain("tamil");
  expect(ogFontNames("తెలుగు")).toContain("telugu");
});
