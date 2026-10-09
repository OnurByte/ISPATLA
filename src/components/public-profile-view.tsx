import type { PublicUserProfile } from "@/server/db";
import Image from "next/image";

export function PublicProfileView({ profile }: { profile: PublicUserProfile }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
    <header className="flex items-center gap-4 border-b pb-5">
      {profile.avatarUrl && <Image src={profile.avatarUrl} alt="" width={80} height={80} unoptimized className="size-20 rounded-full object-cover" />}
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profil</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{profile.displayName || "İsimsiz profil"}</h1>{profile.xHandle && <a className="mt-1 inline-block text-sm text-muted-foreground underline" href={`https://x.com/${encodeURIComponent(profile.xHandle)}`} target="_blank" rel="noreferrer">@{profile.xHandle}</a>}</div>
    </header>
    {profile.bio ? <p className="whitespace-pre-wrap leading-7">{profile.bio}</p> : <p className="text-sm text-muted-foreground">Bu profil için henüz bir bio eklenmemiş.</p>}
  </main>;
}
