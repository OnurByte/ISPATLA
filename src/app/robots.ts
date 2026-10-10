import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/settings", "/sources", "/profile", "/login", "/signup", "/forgot-password", "/reset-password"];
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...privatePaths] }, sitemap: `${PUBLIC_ORIGIN}/sitemap.xml` };
}
