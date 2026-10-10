import { PageHeading } from "@/components/page-heading";
import { ProfileSettings } from "@/components/profile-settings";
import { HitSharingSettings } from "@/components/hit-sharing-settings";
import { getHitSharingSettings } from "@/server/hit-sharing";
import { loadOwnUserProfileFromX } from "@/server/x-profile-sync";
import { renderUserPage } from "@/server/page-auth";
import { requestPublicLocale } from "@/components/public-header";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const locale = await requestPublicLocale();
  return renderUserPage(async () => {
    const [hitSharing, profile] = await Promise.all([getHitSharingSettings(), loadOwnUserProfileFromX()]);
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / profil" title="Profil" description="Görünen ad, bio ve profil görünürlüğü bağlı X hesabından eşitlenir." /><ProfileSettings initial={profile} /><HitSharingSettings initial={hitSharing} locale={locale} /></div></main>;
  });
}
