import { PageHeading } from "@/components/page-heading";
import { StyleProfilesPage } from "@/components/style-profiles-page";
import { getAccounts, getWritingStyleSettings } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function StyleRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / içerik" title="İçerik tercihleri" description="Genel yazım biçimini ve bağlı her hesap için ayrı içerik tercihlerini düzenle." /><StyleProfilesPage initial={getAccounts()} initialSettings={getWritingStyleSettings()} /></div></main>);
}
