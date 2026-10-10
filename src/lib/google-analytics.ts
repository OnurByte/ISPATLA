import { SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";
import { isLandingEventPayload } from "@/lib/landing-measurement";

export const ANALYTICS_CONSENT_KEY = "ispatla:analytics-consent";
export function googleMeasurementId(value: string | undefined): string | null {
  return value && /^G-[A-Z0-9]+$/.test(value) ? value : null;
}
export function analyticsPage(path: string): boolean {
  return path === "/signup" || (SIGNAL_PRESS_PATHS as readonly string[]).includes(path);
}
export function analyticsPageParameters(origin: string, path: string, referrer: string) {
  if (!analyticsPage(path)) return null;
  let page_referrer = "";
  try { page_referrer = new URL(referrer).origin; } catch {}
  return { page_location: new URL(path, origin).href, page_referrer, page_title: path };
}
export function analyticsEvent(value: unknown) {
  if (!isLandingEventPayload(value)) return null;
  return { name: value.event === "signup_complete" ? "sign_up" : value.event, parameters: { page: value.page, source: value.source } };
}
export function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (!/^_ga(?:_|$)/.test(name)) continue;
    const parts = window.location.hostname.split(".");
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (let index = 0; index < parts.length - 1; index++) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${parts.slice(index).join(".")}`;
    }
  }
}
