import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage, localeFromPath, stripLocalePrefix } from "@/i18n/config";

const PRIVATE_PAGES = new Set(["/accounts", "/analytics", "/categories", "/dashboard", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/profile", "/queue", "/settings", "/settings/appearance", "/settings/automation", "/settings/keys", "/settings/profile", "/settings/security", "/settings/style", "/sources"]);

/**
 * Fast sign-in redirect only. Pages and API handlers verify the DB session and
 * bind their queries to its owner; cookie presence does not authorize access.
 */
export function proxy(request: Request): NextResponse {
  const url = new URL(request.url);
  const localeCookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith("ispatla-locale="))?.slice("ispatla-locale=".length);
  const explicitLocale = localeFromPath(url.pathname);
  const locale = explicitLocale
    || (localeCookie && isLocale(localeCookie) ? localeCookie : null)
    || localeFromAcceptLanguage(request.headers.get("accept-language"))
    || DEFAULT_LOCALE;
  const appPath = explicitLocale ? stripLocalePrefix(url.pathname) : url.pathname;

  if (appPath === "/api" || appPath.startsWith("/api/")) {
    if (!explicitLocale) return NextResponse.next();
    const response = NextResponse.redirect(new URL(`${appPath}${url.search}`, url));
    response.cookies.set("ispatla-locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
    return response;
  }

  if (PRIVATE_PAGES.has(appPath) && !getSessionCookie(request)) {
    const loginUrl = new URL("/login", url);
    loginUrl.searchParams.set("next", `${appPath}${url.search}`);
    const response = NextResponse.redirect(loginUrl);
    if (explicitLocale) response.cookies.set("ispatla-locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
    return response;
  }

  if (explicitLocale) {
    const response = NextResponse.redirect(new URL(`${appPath}${url.search}`, url));
    response.cookies.set("ispatla-locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
    return response;
  }

  // The locale is passed to server components through a trusted header, never in route URLs.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ispatla-locale", locale);
  requestHeaders.set("x-ispatla-route", appPath);
  requestHeaders.set("x-ispatla-search", url.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
