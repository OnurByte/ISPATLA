import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { PublicProfileView } from "@/components/public-profile-view";
import { findPublicProfileByPath } from "@/server/public-profile";
import { publicShareUrl, publicSocialImageUrl } from "@/lib/social-sharing";
import { ShareActions } from "@/components/share-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await findPublicProfileByPath(handle);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.displayName || "Profil"}${profile.xHandle ? ` (@${profile.xHandle})` : ""} · ispatla.tr`;
  return {
    title,
    description: profile.bio?.slice(0, 200) || title,
    alternates: { canonical: publicShareUrl(profile.profilePath) },
    openGraph: { type: "profile", title, description: profile.bio?.slice(0, 200) || title, url: publicShareUrl(profile.profilePath), siteName: "İSPATLA", images: [{ url: publicSocialImageUrl(profile.profilePath), width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description: profile.bio?.slice(0, 200) || title, images: [publicSocialImageUrl(profile.profilePath)] },
    robots: { index: true, follow: true },
  };
}

export default async function PublicHandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await findPublicProfileByPath(handle);
  const locale = await requestPublicLocale();
  if (!profile) notFound();
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} /><div className="mx-auto w-full max-w-2xl px-4 pb-12 sm:px-6"><ShareActions url={publicShareUrl(profile.profilePath)} text={(profile.displayName || "İSPATLA profili") + " · İSPATLA"} imageUrl={publicSocialImageUrl(profile.profilePath)} /></div></>;
}
