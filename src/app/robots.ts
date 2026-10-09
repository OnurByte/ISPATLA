import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/settings", "/sources", "/profile", "/login", "/signup", "/forgot-password", "/reset-password"];
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...privatePaths, ...LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) => privatePaths.map((path) => `/${locale}${path}`))] }, sitemap: `${PUBLIC_ORIGIN}/sitemap.xml` };
}
