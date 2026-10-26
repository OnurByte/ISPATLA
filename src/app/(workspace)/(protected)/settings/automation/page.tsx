import { AutomationSettings } from "@/components/automation-settings";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";
import { getAutomationRuntime } from "@/server/dashboard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresXAccounts } from "@/server/postgres-x-oauth";
import { getPostgresAutomationLogs, getPostgresAutomationSchedules } from "@/server/postgres-settings";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";

export default async function AutomationRoute() {
  const locale = await requestPublicLocale();
  const t = (message: string) => getUiText(locale, message);
  return renderUserPage(async () => {
    const owner = currentOwnerId()!;
    const canManageSchedules = owner === process.env.ISPATLA_OPERATOR_USER_ID;
    const accountAutomation = (await getPostgresXAccounts(owner)).map((account) => ({
      accountId: account.id, handle: account.handle, displayName: account.displayName,
      enabled: account.enabled, connected: account.connected, postMode: account.postMode,
    }));
    const [schedules, logs] = canManageSchedules ? await Promise.all([getPostgresAutomationSchedules(), getPostgresAutomationLogs(100)]) : [[], []];
    return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Settings / automation")} title={t("Automation")} description={t("Live worker status and 𝕏 account permissions.")} /><AutomationSettings initial={{ runtime: getAutomationRuntime(), accountAutomation }} canManageSchedules={canManageSchedules} schedules={schedules} logs={logs} /></div></main>;
  });
}
