"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { ANALYTICS_CONSENT_KEY, analyticsEvent, analyticsPage, analyticsPageParameters, clearAnalyticsCookies } from "@/lib/google-analytics";

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const path = usePathname();
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const allowed = analyticsPage(path);
  const enabled = consent === "accepted" && allowed;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(ANALYTICS_CONSENT_KEY); } catch {}
      setConsent(stored === "accepted" || stored === "rejected" ? stored : null);
      setMounted(true);
    }, 0);
    function onStorage(event: StorageEvent) {
      if (event.key !== ANALYTICS_CONSENT_KEY && event.key !== null) return;
      if (event.newValue !== "accepted") {
        (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
        clearAnalyticsCookies();
      }
      setConsent(event.newValue === "accepted" || event.newValue === "rejected" ? event.newValue : null);
    }
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); };
  }, [measurementId]);

  useEffect(() => {
    const target = window as unknown as AnalyticsWindow & Record<string, unknown>;
    target[`ga-disable-${measurementId}`] = !enabled;
    if (!enabled) return;
    target.dataLayer ||= [];
    // Google’s command queue consumes Arguments objects.
    // eslint-disable-next-line prefer-rest-params
    target.gtag ||= function () { target.dataLayer!.push(arguments); };
    target.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    target.gtag("js", new Date());
    target.gtag("config", measurementId, { ...analyticsPageParameters(window.location.origin, window.location.pathname, document.referrer), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  }, [enabled, measurementId]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const target = window as AnalyticsWindow;
    const page = analyticsPageParameters(window.location.origin, path, document.referrer);
    target.gtag?.("event", "page_view", { ...page, send_to: measurementId });
    function onMeasurement(event: Event) {
      if (!analyticsPage(window.location.pathname) || (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`]) return;
      const payload = analyticsEvent((event as CustomEvent).detail);
      if (payload) target.gtag?.("event", payload.name, { ...payload.parameters, ...page, send_to: measurementId });
    }
    window.addEventListener("ispatla:measurement", onMeasurement);
    return () => window.removeEventListener("ispatla:measurement", onMeasurement);
  }, [enabled, ready, path, measurementId]);

  function choose(value: "accepted" | "rejected") {
    if (value === "rejected") {
      (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
      clearAnalyticsCookies();
    }
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value); } catch {}
    setConsent(value);
  }

  if (!mounted || !allowed) return null;
  return <>
    {enabled && <Script id="ispatla-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" onReady={() => setReady(true)} />}
    {consent === null ? <aside aria-label="Analytics consent" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-lg border bg-background p-4 shadow-lg">
      <p className="text-sm">Allow optional Google Analytics cookies to measure public page visits and signups? No analytics request is sent before you accept. <Link href="/privacy" className="underline">Privacy details</Link></p>
      <div className="mt-3 flex gap-3"><button type="button" onClick={() => choose("accepted")} className="rounded border px-3 py-2 text-sm">Accept analytics</button><button type="button" onClick={() => choose("rejected")} className="rounded border px-3 py-2 text-sm">Reject analytics</button></div>
    </aside> : <button type="button" onClick={() => consent === "accepted" ? choose("rejected") : setConsent(null)} className="fixed bottom-2 left-2 z-40 rounded border bg-background px-2 py-1 text-xs">{consent === "accepted" ? "Withdraw analytics consent" : "Analytics preferences"}</button>}
  </>;
}
