import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { PublicProfileView } from "@/components/public-profile-view";
import { findPublicProfileByPath } from "@/server/public-profile";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";
import { localizePath } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = findPublicProfileByPath(handle);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName || "Profil"}${profile.xHandle ? ` (@${profile.xHandle})` : ""} · ispatla.tr`;
  return {
    title,
    description: profile.bio || title,
    alternates: { canonical: `${PUBLIC_ORIGIN}${profile.profilePath}` },
    robots: { index: true, follow: true },
  };
}

export default async function PublicHandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = findPublicProfileByPath(handle);
  const locale = await requestPublicLocale();
  if (!profile) redirect(localizePath(locale, "/"));
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} /></>;
}
