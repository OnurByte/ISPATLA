import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnUserProfile } from "@/server/db-types";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";
import { getUiText } from "@/i18n/ui";
import type { Locale } from "@/i18n/config";

export function ProfileSettings({ initial: profile, locale }: { initial: OwnUserProfile; locale: Locale }) {
  const t = (message: string, params?: Record<string, string | number>) => getUiText(locale, message, params);
  return <Card>
    <CardHeader>
      <CardTitle>{t("Profile")}</CardTitle>
      <CardDescription>
        {profile.xHandle
          ? t("Display name, bio, and profile photo are synced from your 𝕏 account. You cannot edit them here.")
          : t("Your profile information will be fetched automatically when you connect your 𝕏 account. You cannot edit it here.")}
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? <Image src={profile.avatarUrl} alt={t("𝕏 profile photo")} width={64} height={64} unoptimized className="size-16 rounded-full object-cover" /> : <div aria-hidden="true" className="size-16 rounded-full bg-muted" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{profile.displayName || t("Display name has not been fetched yet")}</p>
          {profile.xHandle && <a className="text-sm text-muted-foreground underline" href={`https://x.com/${encodeURIComponent(profile.xHandle)}`} target="_blank" rel="noreferrer">@{profile.xHandle}</a>}
        </div>
      </div>
      {profile.bio && <div className="rounded-lg border p-3 text-sm"><span className="text-muted-foreground">{t("Bio ⁜ 𝕏")}</span><p className="mt-1 whitespace-pre-wrap">{profile.bio}</p></div>}
      <div className="rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">{t("Profile link")}</span>
        <p className="mt-1 break-all font-mono"><a href={profile.profilePath} className="underline">{PUBLIC_ORIGIN}{profile.profilePath}</a></p>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile.xHandle
            ? t("𝕏 visibility: {visibility}. This is synced from your connected 𝕏 account.", { visibility: t(profile.visibility === "public" ? "Public" : "Private") })
            : t("Your profile stays private until you connect an 𝕏 account; visibility will be fetched from the connected account automatically.")}
        </p>
      </div>
      {!profile.xHandle && <p className="text-sm text-muted-foreground">{t("Profile information will sync automatically when you connect an 𝕏 account.")}</p>}
    </CardContent>
  </Card>;
}
