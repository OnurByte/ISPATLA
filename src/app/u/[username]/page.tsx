import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { findPublicProfile } from "@/server/public-profile";
import { PublicProfileView } from "@/components/public-profile-view";
import type { Metadata } from "next";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await findPublicProfile(username);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName || "Profile"}${profile.xHandle ? ` (@${profile.xHandle})` : ""} · ispatla.tr`;
  const description = profile.bio || title;
  const url = `${PUBLIC_ORIGIN}${profile.profilePath}`;
  const images = profile.avatarUrl ? [{ url: `${PUBLIC_ORIGIN}${profile.avatarUrl}`, width: 400, height: 400, alt: title }] : [];
  return {
    title, description, alternates: { canonical: url }, robots: { index: true, follow: true },
    openGraph: { title, description, url, type: "profile", siteName: "İSPATLA", images },
    twitter: { card: "summary", title, description, images: images.map((image) => image.url) },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await findPublicProfile(username);
  if (!profile) notFound();
  if (profile.profilePath !== `/u/${username}`) redirect(profile.profilePath);

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} /></>;
}
