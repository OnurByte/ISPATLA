import { expect, test } from "bun:test";
import { classifyLandingReferrer, isLandingEventPayload, landingEvents, trackLandingEvent } from "../src/lib/landing-measurement";
import { docsCopy } from "../src/i18n/docs-copy";
import { LOCALES } from "../src/i18n/config";
import { firstActionTimeBucket } from "../src/server/landing-measurement";

test("landing measurement accepts only named events and bounded pages", () => {
  expect(isLandingEventPayload({ event: "demo_start", page: "/", source: "direct" })).toBe(true);
  expect(isLandingEventPayload({ event: "demo_start", page: "/compare/superx", source: "direct" })).toBe(false);
  expect(isLandingEventPayload({ event: "signup_click", page: "/", source: "direct", userId: "123" })).toBe(false);
  expect(isLandingEventPayload({ event: "identify", page: "/", source: "direct" })).toBe(false);
  expect(isLandingEventPayload({ event: "open_source_docs", page: "/open-source", source: "github" })).toBe(true);
  expect(isLandingEventPayload({ event: "open_source_docs", page: "/", source: "https://x.com?token=secret" })).toBe(false);
  expect(isLandingEventPayload(null)).toBe(false);
  expect(landingEvents).toHaveLength(6);
  expect(Object.keys(docsCopy).sort()).toEqual([...LOCALES].sort());
  for (const copy of Object.values(docsCopy)) {
    expect(copy.sections).toHaveLength(3);
    expect(copy.metaTitle.length).toBeGreaterThan(0);
    expect(copy.metaDescription.length).toBeGreaterThan(0);
  }
});

test("client helper is inert outside a browser", () => {
  expect(() => trackLandingEvent("demo_start", "/")).not.toThrow();
});

test("first-action elapsed time is reported only in coarse buckets", () => {
  expect([59, 60, 600, 3600, 86400, 604800].map(firstActionTimeBucket)).toEqual([
    "under_1m", "1m_to_10m", "10m_to_1h", "1h_to_24h", "1d_to_7d", "over_7d",
  ]);
  expect(() => firstActionTimeBucket(-1)).toThrow();
  expect(() => firstActionTimeBucket(Number.NaN)).toThrow();
  expect(classifyLandingReferrer("", "https://ispatla.tr")).toBe("direct");
  expect(classifyLandingReferrer("https://x.com/user/status/1?secret=private", "https://ispatla.tr")).toBe("x");
  expect(classifyLandingReferrer("https://github.com/OnurByte/ISPATLA", "https://ispatla.tr")).toBe("github");
  expect(classifyLandingReferrer("https://news.example/article?id=private", "https://ispatla.tr")).toBe("other");
  expect(classifyLandingReferrer("garbage", "https://ispatla.tr")).toBe("other");
});
