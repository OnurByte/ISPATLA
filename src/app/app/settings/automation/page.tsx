import { AppShell } from "@/components/app-shell";
import { AutomationSettings } from "@/components/automation-settings";
import { PageHeading } from "@/components/page-heading";
import { getAutomationLogs, getAutomationSchedules, getSetting } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";

export default function AutomationRoute() {
  return renderUserPage(() => <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / execution" title="Otomasyon kontrolü" description="Zamanlanmış işler, yayın durdurma anahtarı ve doğrulama geçmişi." /><AutomationSettings initial={{ paused: getSetting("automation_paused", "0") === "1" }} schedules={getAutomationSchedules()} logs={getAutomationLogs(100)} /></div></main></AppShell>, true);
}
