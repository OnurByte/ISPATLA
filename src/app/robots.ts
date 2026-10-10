import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/settings", "/sources", "/profile"];
  // Authentication pages stay crawlable so Google can read their noindex metadata.
  return { rules: { userAgent: "*", allow: ["/", "/api/og", "/api/profile/avatar/"], disallow: ["/api/", ...privatePaths] }, sitemap: `${PUBLIC_ORIGIN}/sitemap.xml` };
}
