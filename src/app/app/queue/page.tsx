import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { QueuePage } from "@/components/queue-page";
import { getJobs, getPendingPublicationIntents, getPublicationIntents } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function QueueRoute({ searchParams }: { searchParams: Promise<{ status?: string | string[]; view?: string | string[] }> }) {
  return renderUserPage(async () => {
    const query = await searchParams;
    const statusValue = Array.isArray(query.status) ? query.status[0] : query.status;
    const viewValue = Array.isArray(query.view) ? query.view[0] : query.view;
    const allowedStatuses = new Set(["all", "pending_approval", "approved", "dispatching", "queued", "blocked", "failed", "dead_letter", "pending_reconciliation", "reconciliation_required", "confirmed", "cancelled", "expired"]);
    const intents = [...new Map([...getPendingPublicationIntents(200), ...getPublicationIntents({ limit: 200 })].map((intent) => [intent.id, intent])).values()];
    const initialStatus = statusValue && allowedStatuses.has(statusValue) ? statusValue : "all";
    return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Otomasyon / yürütme" title="Yayın kuyruğu" description="Onayları, resmi 𝕏 API dispatch durumlarını ve uzaktaki doğrulama kanıtını yönetin." /><QueuePage initial={getJobs()} initialIntents={intents} initialStatus={initialStatus} initialView={viewValue === "calendar" ? "calendar" : "list"} /></div></main></AppShell>;
  });
}
