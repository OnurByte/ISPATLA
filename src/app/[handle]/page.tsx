import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { PublicProfileView } from "@/components/public-profile-view";
import { findPublicProfileByPath } from "@/server/public-profile";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await findPublicProfileByPath(handle);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName || "Profile"}${profile.xHandle ? ` (@${profile.xHandle})` : ""} · ispatla.tr`;
  const description = profile.bio || title;
  const url = `${PUBLIC_ORIGIN}${profile.profilePath}`;
  const images = profile.avatarUrl ? [{ url: `${PUBLIC_ORIGIN}${profile.avatarUrl}`, width: 400, height: 400, alt: title }] : [];
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, type: "profile", siteName: "İSPATLA", images },
    twitter: { card: "summary", title, description, images: images.map((image) => image.url) },
  };
}

export default async function PublicHandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await findPublicProfileByPath(handle);
  const locale = await requestPublicLocale();
  if (!profile) notFound();
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} /></>;
}
