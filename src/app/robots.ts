import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/app/", "/login", "/signup", "/forgot-password", "/reset-password"];
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...privatePaths, ...LOCALES.flatMap((locale) => privatePaths.map((path) => `/${locale}${path}`))] }, sitemap: `${PUBLIC_ORIGIN}/sitemap.xml` };
}
