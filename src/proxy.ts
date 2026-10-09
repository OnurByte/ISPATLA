import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { SEARCH_PAGE_PATHS } from "@/generated/search-routes";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage } from "@/i18n/config";

/**
 * Fast sign-in redirect only. Pages and API handlers verify the DB session and
 * bind their queries to its owner; cookie presence does not authorize access.
 */
export function proxy(request: Request): NextResponse {
  const url = new URL(request.url);
  const firstSegment = url.pathname.split("/")[1] || "";
  const localeCookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith("ispatla-locale="))?.slice("ispatla-locale=".length);
  const cookieLocale = localeCookie || "";
  const locale = isLocale(firstSegment) ? firstSegment
    : isLocale(cookieLocale) ? cookieLocale
      : localeFromAcceptLanguage(request.headers.get("accept-language")) || DEFAULT_LOCALE;
  const hasLocalePrefix = isLocale(firstSegment);
  const appPath = hasLocalePrefix ? url.pathname.slice(locale.length + 1) || "/" : url.pathname;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return NextResponse.next();

  if (firstSegment === DEFAULT_LOCALE) {
    const canonicalUrl = new URL(url);
    canonicalUrl.pathname = appPath;
    const response = NextResponse.redirect(canonicalUrl);
    response.cookies.set("ispatla-locale", DEFAULT_LOCALE, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
    return response;
  }

  const knownPage = (SEARCH_PAGE_PATHS as readonly string[]).includes(appPath) || appPath === "/settings/profile"
    || appPath === "/app" || appPath.startsWith("/app/") || /^\/u\/[A-Za-z0-9_-]{24}$/.test(appPath);
  const singleSegmentProfile = /^\/[^/]+$/.test(appPath);
  if (!knownPage && !singleSegmentProfile && !/\.[^/]+$/.test(appPath)) {
    return NextResponse.redirect(new URL(`${hasLocalePrefix ? `/${locale}` : ""}/`, url));
  }

  const privateRoots = ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/settings", "/sources", "/profile"];
  if (privateRoots.some((path) => appPath === path || appPath.startsWith(`${path}/`)) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(`${hasLocalePrefix ? `/${locale}` : ""}/login`, url));
  }

  // OAuth/API callback URLs remain flat. Localized page URLs are rewritten internally,
  // while the selected locale is passed to server components through a trusted header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ispatla-locale", locale);
  requestHeaders.set("x-ispatla-route", appPath);
  if (!hasLocalePrefix) return NextResponse.next({ request: { headers: requestHeaders } });

  url.pathname = appPath;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
