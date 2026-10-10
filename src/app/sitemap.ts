import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN, SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";
import { getPostgresPublicProfileSitemapEntries } from "@/server/postgres-public-profile";
import { isPublicProfileSlug } from "@/server/public-profile";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = SIGNAL_PRESS_PATHS.map(path => ({ url: `${PUBLIC_ORIGIN}${path}` }));
  const profiles = await getPostgresPublicProfileSitemapEntries(50_001 - staticEntries.length);
  // shortcut: one sitemap supports 50,000 URLs, split it before exceeding that limit.
  if (profiles.length + staticEntries.length > 50_000) throw new Error("Public sitemap requires splitting");
  return [...staticEntries, ...profiles.filter(profile => !profile.path.startsWith("/u/") || isPublicProfileSlug(profile.path.slice(3))).map(profile => ({
    url: `${PUBLIC_ORIGIN}${profile.path}`,
    ...(Number.isSafeInteger(profile.updatedAt) && profile.updatedAt > 0 ? { lastModified: new Date(profile.updatedAt * 1000) } : {}),
  }))];
}
