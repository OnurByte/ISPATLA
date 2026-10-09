import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnUserProfile } from "@/server/db";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export function ProfileSettings({ initial: profile }: { initial: OwnUserProfile }) {
  return <Card>
    <CardHeader>
      <CardTitle>Profil</CardTitle>
      <CardDescription>
        {profile.xHandle
          ? "Görünen ad, bio ve profil fotoğrafı 𝕏 hesabından senkronlanır. Bu bilgiler burada düzenlenemez."
          : "𝕏 hesabın bağlandığında profil bilgilerin otomatik alınır. Bu ekranda profil bilgileri düzenlenemez."}
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? <Image src={profile.avatarUrl} alt="𝕏 profil fotoğrafı" width={64} height={64} unoptimized className="size-16 rounded-full object-cover" /> : <div aria-hidden="true" className="size-16 rounded-full bg-muted" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{profile.displayName || "Görünen ad henüz alınmadı"}</p>
          {profile.xHandle && <a className="text-sm text-muted-foreground underline" href={`https://x.com/${encodeURIComponent(profile.xHandle)}`} target="_blank" rel="noreferrer">@{profile.xHandle}</a>}
        </div>
      </div>
      {profile.bio && <div className="rounded-lg border p-3 text-sm"><span className="text-muted-foreground">Bio · 𝕏</span><p className="mt-1 whitespace-pre-wrap">{profile.bio}</p></div>}
      <div className="rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">Profil bağlantısı</span>
        <p className="mt-1 break-all font-mono"><a href={profile.profilePath} className="underline">{PUBLIC_ORIGIN}{profile.profilePath}</a></p>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile.xHandle
            ? "𝕏 görünürlüğü: " + (profile.visibility === "public" ? "Herkese açık" : "Gizli") + ". Bu durum bağlı 𝕏 hesabından senkronlanır."
            : "𝕏 hesabı bağlanana kadar profil gizli kalır; görünürlük bağlı hesaptan otomatik alınır."}
        </p>
      </div>
      {!profile.xHandle && <p className="text-sm text-muted-foreground">𝕏 bağlantısı kurulunca profil bilgileri otomatik senkronlanır.</p>}
    </CardContent>
  </Card>;
}
