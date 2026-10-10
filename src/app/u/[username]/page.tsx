import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { findPublicProfile } from "@/server/public-profile";
import type { Metadata } from "next";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";
import { PublicProfileView } from "@/components/public-profile-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await findPublicProfile(username);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName || "Profile"} · ispatla.tr`;
  return { title, description: profile.bio || title, alternates: { canonical: `${PUBLIC_ORIGIN}${profile.profilePath}` }, robots: { index: true, follow: true } };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await findPublicProfile(username);
  if (!profile) notFound();
  if (profile.profilePath !== `/u/${username}`) redirect(profile.profilePath);

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} /></>;
}
