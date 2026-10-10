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
  expect(isLandingEventPayload({ event: "signup_complete", page: "/signup", source: "google" })).toBe(true);
  expect(landingEvents).toHaveLength(7);
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

test("browser measurement publishes only bounded categories and omits cookies", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = globalThis.fetch;
  const target = new EventTarget();
  let detail: unknown;
  let request: RequestInit | undefined;
  target.addEventListener("ispatla:measurement", (event) => { detail = (event as CustomEvent).detail; });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://ispatla.tr" }, dispatchEvent: target.dispatchEvent.bind(target) } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "https://www.google.com/search?q=private" } });
  globalThis.fetch = (async (_url: unknown, options: RequestInit) => { request = options; return new Response(null, { status: 204 }); }) as typeof fetch;
  try {
    trackLandingEvent("signup_complete", "/signup");
    await Promise.resolve();
    expect(detail).toEqual({ event: "signup_complete", page: "/signup", source: "google" });
    expect(request?.credentials).toBe("omit");
    expect(request?.keepalive).toBe(true);
    expect(JSON.parse(String(request?.body))).toEqual(detail);
    expect(request?.body).not.toContain("private");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
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
  expect(classifyLandingReferrer("https://t.co/link", "https://ispatla.tr")).toBe("x");
  for (const domain of ["google.com", "www.google.com.tr", "www.google.co.uk", "google.de"]) {
    expect(classifyLandingReferrer(`https://${domain}/search?q=private`, "https://ispatla.tr")).toBe("google");
  }
  for (const domain of ["google.com.evil.test", "evilgoogle.com", "t.co.evil.test", "x.com.evil.test"]) {
    expect(classifyLandingReferrer(`https://${domain}/`, "https://ispatla.tr")).toBe("other");
  }
  expect(classifyLandingReferrer("https://ispatla.tr/signup", "https://ispatla.tr")).toBe("direct");
  expect(classifyLandingReferrer("https://news.example/article?id=private", "https://ispatla.tr")).toBe("other");
  expect(classifyLandingReferrer("garbage", "https://ispatla.tr")).toBe("other");
});

test("tab attribution survives internal signup and replaces only with external acquisition", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalFetch = globalThis.fetch;
  let stored: string | null = null;
  let referrer = "https://www.google.com/search?q=private";
  let detail: unknown;
  let googleCalls = 0;
  const sessionStorage = {
    getItem: (_key: string): string | null => stored,
    setItem: (_key: string, value: string) => { stored = value; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "https://ispatla.tr" }, sessionStorage,
    gtag: () => { googleCalls++; },
    dispatchEvent: (event: CustomEvent) => { detail = event.detail; return true; },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { get referrer() { return referrer; } } });
  globalThis.fetch = Object.assign(async () => new Response(null, { status: 204 }), { preconnect: originalFetch.preconnect });
  try {
    trackLandingEvent("landing_view", "/");
    expect(sessionStorage.getItem("ispatla:landing-source")).toBe("google");
    referrer = "https://ispatla.tr/";
    trackLandingEvent("signup_complete", "/signup");
    expect(detail).toEqual({ event: "signup_complete", page: "/signup", source: "google" });
    referrer = "https://t.co/new-link";
    trackLandingEvent("landing_view", "/");
    expect(sessionStorage.getItem("ispatla:landing-source")).toBe("x");
    referrer = "";
    trackLandingEvent("signup_click", "/");
    expect(sessionStorage.getItem("ispatla:landing-source")).toBe("x");
    stored = "https://google.com/?private=secret";
    referrer = "https://ispatla.tr/";
    trackLandingEvent("signup_complete", "/signup");
    expect(sessionStorage.getItem("ispatla:landing-source")).toBe("direct");
    expect(detail).toEqual({ event: "signup_complete", page: "/signup", source: "direct" });
    sessionStorage.getItem = () => { throw new Error("blocked"); };
    referrer = "https://github.com/project";
    expect(() => trackLandingEvent("landing_view", "/")).not.toThrow();
    expect(detail).toEqual({ event: "landing_view", page: "/", source: "github" });
    sessionStorage.getItem = () => "google";
    sessionStorage.setItem = () => { throw new Error("quota"); };
    referrer = "https://ispatla.tr/";
    expect(() => trackLandingEvent("signup_complete", "/signup")).not.toThrow();
    expect(detail).toEqual({ event: "signup_complete", page: "/signup", source: "google" });
    expect(googleCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
