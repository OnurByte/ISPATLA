import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage } from "@/i18n/config";

const PRIVATE_PAGES = new Set(["/accounts", "/analytics", "/categories", "/dashboard", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/profile", "/queue", "/settings", "/settings/appearance", "/settings/automation", "/settings/keys", "/settings/profile", "/settings/security", "/settings/style", "/sources"]);

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

  if (PRIVATE_PAGES.has(appPath) && !getSessionCookie(request)) {
    const loginUrl = new URL(`${hasLocalePrefix ? `/${locale}` : ""}/login`, url);
    loginUrl.searchParams.set("next", `${appPath}${url.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // OAuth/API callback URLs remain flat. Localized page URLs are rewritten internally,
  // while the selected locale is passed to server components through a trusted header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ispatla-locale", locale);
  requestHeaders.set("x-ispatla-route", appPath);
  requestHeaders.set("x-ispatla-search", url.search);
  if (!hasLocalePrefix) return NextResponse.next({ request: { headers: requestHeaders } });

  url.pathname = appPath;
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.cookies.set("ispatla-locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
