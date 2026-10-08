import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { StyleProfilesPage } from "@/components/style-profiles-page";
import { getAccounts, getWritingStyleSettings } from "@/server/db";
import { ideologyOptions } from "@/server/ideologies";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function StyleRoute() {
  return renderUserPage(() => <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / voice" title="Stil profilleri" description="Hesap ve örnek post sesini, yerel writing skill’leriyle birlikte üretime bağla." /><StyleProfilesPage initial={getAccounts()} initialSettings={getWritingStyleSettings()} ideologies={ideologyOptions()} /></div></main></AppShell>);
}
