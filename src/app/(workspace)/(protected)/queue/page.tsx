import { PageHeading } from "@/components/page-heading";
import { QueuePage } from "@/components/queue-page";
import { listPostgresQueueJobs, listPostgresPublicationIntents } from "@/server/postgres-queue-store";
import { renderUserPage } from "@/server/page-auth";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";

export const dynamic = "force-dynamic";

export default async function QueueRoute({ searchParams }: { searchParams: Promise<{ status?: string | string[]; view?: string | string[] }> }) {
  return renderUserPage(async () => {
    const query = await searchParams;
    const locale = await requestPublicLocale();
    const t = (message: string, params?: Record<string, string | number>) => getUiText(locale, message, params);
    const statusValue = Array.isArray(query.status) ? query.status[0] : query.status;
    const viewValue = Array.isArray(query.view) ? query.view[0] : query.view;
    const allowedStatuses = new Set(["all", "pending_approval", "approved", "dispatching", "queued", "blocked", "failed", "dead_letter", "pending_reconciliation", "reconciliation_required", "confirmed", "cancelled", "expired"]);
    const [jobs, pendingIntents, allIntents] = await Promise.all([
      listPostgresQueueJobs(),
      listPostgresPublicationIntents(200, "pending_approval"),
      listPostgresPublicationIntents(200),
    ]);
    const intents = [...new Map([...pendingIntents, ...allIntents].map((intent) => [intent.id, intent])).values()];
    const initialStatus = statusValue && allowedStatuses.has(statusValue) ? statusValue : "all";
    return <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Automation / execution")} title={t("Publication queue")} description={t("Manage approvals, official 𝕏 API dispatch status, and remote verification evidence.")} /><QueuePage initial={jobs} initialIntents={intents} initialStatus={initialStatus} initialView={viewValue === "calendar" ? "calendar" : "list"} /></div></main>;
  });
}
