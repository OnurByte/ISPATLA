import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { ProfileSettings } from "@/components/profile-settings";
import { HitSharingSettings } from "@/components/hit-sharing-settings";
import { getOwnUserProfile } from "@/server/db";
import { getHitSharingSettings } from "@/server/hit-sharing";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function ProfileSettingsPage() {
  return renderUserPage(() => {
    const hitSharing = getHitSharingSettings();
    return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / profil" title="Paylaşım profili" description="Sahibi olduğun paylaşım profilini görüntüle ve herkese açık olmasını açıkça seç." /><ProfileSettings initial={getOwnUserProfile()} /><HitSharingSettings initial={hitSharing} /></div></main></AppShell>;
  });
}
