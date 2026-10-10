import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { findPublicProfile } from "@/server/public-profile";
import { PublicProfileView } from "@/components/public-profile-view";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await findPublicProfile(username);
  if (!profile) notFound();
  if (profile.xHandle) redirect(profile.profilePath);

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><PublicProfileView profile={profile} locale={locale} /></>;
}
