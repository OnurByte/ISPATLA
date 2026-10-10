import { expect, test } from "bun:test";
import { analyticsEvent, analyticsPage, analyticsPageParameters, googleMeasurementId, clearAnalyticsCookies } from "../src/lib/google-analytics";

test("GA configuration requires a bounded measurement ID", () => {
  expect(googleMeasurementId("G-ABC123")).toBe("G-ABC123");
  for (const value of [undefined, "", "G-abcd", "G-ABC&x=1", "G-ABC\n", "UA-123"]) expect(googleMeasurementId(value)).toBeNull();
});
test("analytics admits only fixed public pages and sanitizes URL data", () => {
  expect(analyticsPage("/signup")).toBe(true);
  expect(analyticsPage("/privacy")).toBe(true);
  for (const path of ["/onur", "/settings", "/api/profile", "/signup?token=secret", "//evil.test", "/docs/unknown"]) {
    expect(analyticsPage(path)).toBe(false);
    expect(analyticsPageParameters("https://ispatla.tr", path, "")).toBeNull();
  }
  expect(analyticsPageParameters("https://ispatla.tr", "/", "https://google.com/search?q=private#secret")).toEqual({ page_location: "https://ispatla.tr/", page_referrer: "https://google.com", page_title: "/" });
  expect(analyticsEvent({ event: "signup_complete", page: "/signup", source: "google" })).toEqual({ name: "sign_up", parameters: { page: "/signup", source: "google" } });
  expect(analyticsEvent({ event: "signup_complete", page: "/signup", source: "google", email: "private" })).toBeNull();
});
test("withdrawal clears GA cookies at host and parent domain without clearing session cookies", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const writes: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "www.ispatla.tr" } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { get cookie() { return "_ga=one; _ga_ABC=two; session=secret"; }, set cookie(value: string) { writes.push(value); } } });
  try {
    clearAnalyticsCookies();
    expect(writes).toHaveLength(6);
    expect(writes.some(value => value.includes("domain=.ispatla.tr"))).toBe(true);
    expect(writes.some(value => value.includes("session"))).toBe(false);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor); else Reflect.deleteProperty(globalThis, "document");
  }
});
