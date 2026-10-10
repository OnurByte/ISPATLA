import { AutomationSettings } from "@/components/automation-settings";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";
import { getAutomationRuntime } from "@/server/dashboard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresXAccounts } from "@/server/postgres-x-oauth";
import { getPostgresAutomationLogs, getPostgresAutomationSchedules } from "@/server/postgres-settings";

export default async function AutomationRoute() {
  return renderUserPage(async () => {
    const owner = currentOwnerId()!;
    const canManageSchedules = owner === process.env.ISPATLA_OPERATOR_USER_ID;
    const accountAutomation = (await getPostgresXAccounts(owner)).map((account) => ({
      accountId: account.id, handle: account.handle, displayName: account.displayName,
      enabled: account.enabled, connected: account.connected, postMode: account.postMode,
    }));
    const [schedules, logs] = canManageSchedules ? await Promise.all([getPostgresAutomationSchedules(), getPostgresAutomationLogs(100)]) : [[], []];
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / otomasyon" title="Otomasyon" description="Çalıştırıcının canlı durumu ve X hesabı izinleri." /><AutomationSettings initial={{ runtime: getAutomationRuntime(), accountAutomation }} canManageSchedules={canManageSchedules} schedules={schedules} logs={logs} /></div></main>;
  });
}
