import { PageHeading } from "@/components/page-heading";
import { ProfileSettings } from "@/components/profile-settings";
import { HitSharingSettings } from "@/components/hit-sharing-settings";
import { getHitSharingSettings } from "@/server/hit-sharing";
import { loadOwnUserProfileFromX } from "@/server/x-profile-sync";
import { renderUserPage } from "@/server/page-auth";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const locale = await requestPublicLocale();
  const t = (message: string) => getUiText(locale, message);
  return renderUserPage(async () => {
    const [hitSharing, profile] = await Promise.all([getHitSharingSettings(), loadOwnUserProfileFromX()]);
    return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Settings / profile")} title={t("Profile")} description={t("Your display name, bio, and profile visibility sync from your connected 𝕏 account.")} /><ProfileSettings initial={profile} locale={locale} /><HitSharingSettings initial={hitSharing} locale={locale} /></div></main>;
  });
}
