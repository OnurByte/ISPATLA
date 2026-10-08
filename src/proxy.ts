import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

/**
 * Fast sign-in redirect only. Pages and API handlers verify the DB session and
 * bind their queries to its owner; cookie presence does not authorize access.
 */
export function proxy(request: Request): NextResponse {
  const url = new URL(request.url);
  const firstSegment = url.pathname.split("/")[1] || "";
  const localeCookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith("ispatla-locale="))?.slice("ispatla-locale=".length);
  const cookieLocale = localeCookie || "";
  const locale = isLocale(firstSegment) ? firstSegment : isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const hasLocalePrefix = isLocale(firstSegment);
  const appPath = hasLocalePrefix ? url.pathname.slice(locale.length + 1) || "/" : url.pathname;

  if ((appPath === "/app" || appPath.startsWith("/app/")) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(`${hasLocalePrefix ? `/${locale}` : ""}/login`, url));
  }

  // OAuth/API callback URLs remain flat. Localized page URLs are rewritten internally,
  // while the selected locale is passed to server components through a trusted header.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return NextResponse.next();
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
