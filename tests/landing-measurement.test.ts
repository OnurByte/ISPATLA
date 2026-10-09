import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { classifyLandingReferrer, isLandingEventPayload, landingEvents, trackLandingEvent } from "../src/lib/landing-measurement";
import { docsCopy } from "../src/i18n/docs-copy";
import { LOCALES } from "../src/i18n/config";
import { firstActionTimeBucket, recordLandingEvent } from "../src/server/landing-measurement";

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

test("landing events retain only coarse daily totals and preserve legacy counts", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE landing_event_daily(day TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,event,page)); INSERT INTO landing_event_daily VALUES('2026-10-09','demo_start','/',4);");
    recordLandingEvent(db, "demo_start", "/", Date.parse("2026-10-09T10:00:00Z") / 1000, "x");
    expect(db.prepare("SELECT day,event,page,bucket,source,count FROM landing_event_daily ORDER BY day,event").all()).toEqual([
      { day: "2026-10-09", event: "demo_start", page: "/", bucket: "", source: "direct", count: 4 },
      { day: "2026-10-09", event: "demo_start", page: "/", bucket: "", source: "x", count: 1 },
    ]);
    expect(db.prepare("PRAGMA table_info(landing_event_daily)").all().map((row) => (row as { name: string }).name)).toEqual(["day", "event", "page", "bucket", "source", "count"]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='landing_event_daily_legacy'").all()).toHaveLength(1);
  } finally { db.close(); }
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
