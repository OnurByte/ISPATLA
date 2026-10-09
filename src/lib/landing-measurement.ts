export const landingEvents = [
  "landing_view",
  "demo_start",
  "demo_complete",
  "signup_click",
  "github_click",
  "open_source_docs",
] as const;

export type LandingEvent = (typeof landingEvents)[number];
export const landingPages = ["/", "/open-source"] as const;
export type LandingPage = (typeof landingPages)[number];
export const landingTrafficSources = ["direct", "x", "github", "other"] as const;
export type LandingTrafficSource = (typeof landingTrafficSources)[number];

export function classifyLandingReferrer(value: string, siteOrigin: string): LandingTrafficSource {
  if (!value) return "direct";
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === new URL(siteOrigin).hostname.toLowerCase()) return "direct";
    if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) return "x";
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

/** Best-effort aggregate event. No identifier, cookie, or client storage is used. */
export function trackLandingEvent(event: LandingEvent, page: LandingPage): void {
  if (typeof window === "undefined") return;
  const source = classifyLandingReferrer(document.referrer, window.location.origin);
  void fetch("/api/landing-events", {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, page, source }),
    keepalive: true,
  }).catch(() => {});
}
