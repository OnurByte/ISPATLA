"use client";

import { useEffect } from "react";
import { landingEvents, type LandingEvent } from "@/lib/landing-measurement";
import { trackLandingEvent } from "@/lib/landing-measurement";

/** Keeps analytics in a client leaf while the editorial page remains server rendered. */
export function LandingEventObserver({ page = "/" }: { page?: "/" | "/open-source" }) {
  useEffect(() => {
    if (page === "/") trackLandingEvent("landing_view", page);

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const marked = target.closest<HTMLElement>("[data-landing-event]");
      if (marked) {
        const name = marked.dataset.landingEvent;
        if (name && landingEvents.includes(name as LandingEvent) && marked.dataset.landingPage === page) {
          trackLandingEvent(name as LandingEvent, page);
        }
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link && /\/signup(?:[/?#]|$)/.test(link.pathname)) {
        trackLandingEvent("signup_click", page);
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [page]);

  return null;
}
