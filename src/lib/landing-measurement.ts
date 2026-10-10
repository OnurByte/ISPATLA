export const landingEvents = [
  "landing_view",
  "demo_start",
  "demo_complete",
  "signup_click",
  "signup_complete",
  "github_click",
  "open_source_docs",
] as const;

export type LandingEvent = (typeof landingEvents)[number];
export const landingPages = ["/", "/open-source", "/signup"] as const;
export type LandingPage = (typeof landingPages)[number];
export const landingTrafficSources = ["direct", "google", "x", "github", "other"] as const;
export type LandingTrafficSource = (typeof landingTrafficSources)[number];

export function classifyLandingReferrer(value: string, siteOrigin: string): LandingTrafficSource {
  if (!value) return "direct";
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === new URL(siteOrigin).hostname.toLowerCase()) return "direct";
    if (hostname === "t.co" || hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) return "x";
    if (/^(?:www\.)?google\.(?:com|cat|[a-z]{2}|(?:com|co)\.[a-z]{2})$/.test(hostname)) return "google";
    if (hostname === "github.com" || hostname.endsWith(".github.com")) return "github";
    return "other";
  } catch { return "other"; }
}

export function isLandingEventPayload(value: unknown): value is { event: LandingEvent; page: LandingPage; source: LandingTrafficSource } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || Object.keys(body).some((key) => key !== "event" && key !== "page" && key !== "source")) return false;
  return typeof body.event === "string" && landingEvents.includes(body.event as LandingEvent)
    && typeof body.page === "string" && landingPages.includes(body.page as LandingPage)
    && typeof body.source === "string" && landingTrafficSources.includes(body.source as LandingTrafficSource);
}

/** Best-effort aggregate event. Only a source category is kept for this tab. */
export function trackLandingEvent(event: LandingEvent, page: LandingPage): void {
  if (typeof window === "undefined") return;
  let source = classifyLandingReferrer(document.referrer, window.location.origin);
  try {
    const stored = window.sessionStorage.getItem("ispatla:landing-source");
    // A new external acquisition replaces the tab's previous source.
    if (source === "direct" && stored && landingTrafficSources.includes(stored as LandingTrafficSource)) source = stored as LandingTrafficSource;
    window.sessionStorage.setItem("ispatla:landing-source", source);
  } catch { /* Storage can be unavailable; referrer classification still works. */ }
  window.dispatchEvent(new CustomEvent("ispatla:measurement", { detail: { event, page, source } }));
  void fetch("/api/landing-events", {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, page, source }),
    keepalive: true,
  }).catch(() => {});
}
