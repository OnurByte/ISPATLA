import { PageHeading } from "@/components/page-heading";
import { StyleProfilesPage } from "@/components/style-profiles-page";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresWritingStyleSettings } from "@/server/postgres-settings";
import { getUiText } from "@/i18n/ui";
import { requestPublicLocale } from "@/components/public-header";

export const dynamic = "force-dynamic";

export default function StyleRoute() {
  const locale = requestPublicLocale();
  return renderUserPage(async () => {
    const currentLocale = await locale;
    const t = (message: string, params?: Record<string, string | number>) => getUiText(currentLocale, message, params);
    const owner = currentOwnerId();
    if (!owner) throw new Error("authenticated owner required");
    const [accounts, initialSettings] = await Promise.all([getPostgresAccounts(owner), getPostgresWritingStyleSettings()]);
    return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Settings / content")} title={t("Content preferences")} description={t("Edit the shared writing style and separate content preferences for each connected account.")} /><StyleProfilesPage initial={accounts} initialSettings={initialSettings} /></div></main>;
  });
}
