import { DraftsPage } from "@/components/drafts-page";
import { PageHeading } from "@/components/page-heading";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresDrafts } from "@/server/postgres-drafts";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";
export default function DraftsRoute({ searchParams }: { searchParams: Promise<{ draft?: string | string[] }> }) {
  return renderUserPage(async () => {
    const query = await searchParams;
    const value = Array.isArray(query.draft) ? query.draft[0] : query.draft;
    const selectedDraftId = value && /^\d+$/.test(value) ? Number(value) : undefined;
    const owner = currentOwnerId();
    if (!owner) return null;
    const [drafts, rows] = await Promise.all([getPostgresDrafts(), getPostgresAccounts(owner)]);
    const accounts = rows.map((row) => ({ ...row, subscriptionState: { tier: "unknown" as const, observedAt: 0, historyComplete: false } }));
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Üretim / edit" title="Draft stüdyosu" description="Draft metinlerini ve sürüm geçmişini yönetin." /><DraftsPage initial={drafts} accounts={accounts} selectedDraftId={selectedDraftId} /></div></main>;
  });
}
