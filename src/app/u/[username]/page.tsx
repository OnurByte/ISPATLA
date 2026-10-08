import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import { findPublicProfile } from "@/server/public-profile";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = findPublicProfile(username);
  if (!profile) notFound();

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
    <header className="border-b pb-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profil</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">{profile.displayName || "İsimsiz profil"}</h1></header>
    {profile.bio ? <p className="whitespace-pre-wrap leading-7">{profile.bio}</p> : <p className="text-sm text-muted-foreground">Bu profil için henüz bir bio eklenmemiş.</p>}
  </main></>;
}
