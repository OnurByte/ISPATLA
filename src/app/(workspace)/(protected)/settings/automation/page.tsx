import { AutomationSettings } from "@/components/automation-settings";
import { PageHeading } from "@/components/page-heading";
import { getAccounts, getAutomationLogs, getAutomationSchedules } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";
import { getAutomationRuntime } from "@/server/dashboard";
import { currentOwnerId } from "@/server/owner-context";
import { getXAccountAuthState } from "@/server/x-oauth-store";

export default function AutomationRoute() {
  return renderUserPage(() => {
    const owner = currentOwnerId()!;
    const canManageSchedules = owner === process.env.ISPATLA_OPERATOR_USER_ID;
    const accountAutomation = getAccounts().filter((account) => account.ownerUserId === owner).map((account) => {
      const state = getXAccountAuthState(account.id, owner);
      return { accountId: account.id, handle: account.handle, displayName: account.displayName, enabled: account.enabled, connected: Boolean(state?.connected), postMode: state?.consents.find((consent) => consent.action === "post")?.mode || "off" };
    });
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / otomasyon" title="Otomasyon" description="Çalıştırıcının canlı durumu ve X hesabı izinleri." /><AutomationSettings initial={{ runtime: getAutomationRuntime(), accountAutomation }} canManageSchedules={canManageSchedules} schedules={canManageSchedules ? getAutomationSchedules() : []} logs={canManageSchedules ? getAutomationLogs(100) : []} /></div></main>;
  });
}
