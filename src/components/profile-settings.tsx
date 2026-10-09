"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnUserProfile } from "@/server/db";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export function ProfileSettings({ initial }: { initial: OwnUserProfile }) {
  const [profile, setProfile] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: profile.displayName, bio: profile.bio, visibility: profile.visibility }),
      });
      const body = await response.json() as OwnUserProfile & { error?: string };
      if (!response.ok) throw new Error(body.error || "Profil kaydedilemedi.");
      setProfile(body);
      setMessage("Profil ayarları kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profil kaydedilemedi.");
    } finally { setPending(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Paylaşılabilir profil</CardTitle><CardDescription>{profile.xHandle ? "𝕏 hesabından içe aktarılan profil fotoğrafı, görünen ad ve bio burada görünür. Herkese açtığında bunlar ve 𝕏 hesabın paylaşım bağlantında yayımlanır." : "Görünen adını ve bio’nu düzenle, profilinin kimlere açık olacağını seç."}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? <Image src={profile.avatarUrl} alt="𝕏 profil fotoğrafı" width={64} height={64} unoptimized className="size-16 rounded-full object-cover" /> : <div aria-hidden="true" className="size-16 rounded-full bg-muted" />}
        <div><p className="text-sm font-medium">{profile.displayName || "Görünen ad ekle"}</p>{profile.xHandle && <a className="text-sm text-muted-foreground underline" href={`https://x.com/${encodeURIComponent(profile.xHandle)}`} target="_blank" rel="noreferrer">@{profile.xHandle}</a>}</div>
      </div>
      <div className="rounded-lg border p-3 text-sm"><span className="text-muted-foreground">Profil bağlantısı</span><p className="mt-1 break-all font-mono"><a href={profile.profilePath} className="underline">{PUBLIC_ORIGIN}{profile.profilePath}</a></p><p className="mt-1 text-xs text-muted-foreground">Görünürlük ayarın kapalıysa bu sayfa gösterilmez.</p></div>
      <label className="flex flex-col gap-2 text-sm">Görünen ad<input className="h-10 rounded-md border bg-background px-3" maxLength={80} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></label>
      <label className="flex flex-col gap-2 text-sm">Bio<textarea className="min-h-28 rounded-md border bg-background px-3 py-2" maxLength={500} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-1" type="checkbox" checked={profile.visibility === "public"} onChange={(event) => setProfile({ ...profile, visibility: event.target.checked ? "public" : "private" })} /><span><strong>Profili herkese aç</strong><span className="mt-1 block text-muted-foreground">Açıkken görünen adın, bio’n{profile.avatarUrl ? ", profil fotoğrafın" : ""}{profile.xHandle ? " ve 𝕏 hesabına bağlantı" : ""} yayımlanır.</span></span></label>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Button type="button" className="self-start" onClick={() => void save()} disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
    </CardContent>
  </Card>;
}
