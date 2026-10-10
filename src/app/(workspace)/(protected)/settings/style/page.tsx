import { PageHeading } from "@/components/page-heading";
import { StyleProfilesPage } from "@/components/style-profiles-page";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresWritingStyleSettings } from "@/server/postgres-settings";

export const dynamic = "force-dynamic";

export default function StyleRoute() {
  return renderUserPage(async () => {
    const owner = currentOwnerId();
    if (!owner) throw new Error("authenticated owner required");
    const [accounts, initialSettings] = await Promise.all([getPostgresAccounts(owner), getPostgresWritingStyleSettings()]);
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / içerik" title="İçerik tercihleri" description="Genel yazım biçimini ve bağlı her hesap için ayrı içerik tercihlerini düzenle." /><StyleProfilesPage initial={accounts} initialSettings={initialSettings} /></div></main>;
  });
}
