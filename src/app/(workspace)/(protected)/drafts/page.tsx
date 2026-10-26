import { DraftsPage } from "@/components/drafts-page";
import { PageHeading } from "@/components/page-heading";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresDrafts } from "@/server/postgres-drafts";
import { renderUserPage } from "@/server/page-auth";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";

export const dynamic = "force-dynamic";
export default function DraftsRoute({ searchParams }: { searchParams: Promise<{ draft?: string | string[]; externalId?: string }> }) {
  return renderUserPage(async () => {
    const query = await searchParams;
    const locale = await requestPublicLocale();
    const t = (message: string, params?: Record<string, string | number>) => getUiText(locale, message, params);
    const value = Array.isArray(query.draft) ? query.draft[0] : query.draft;
    const selectedDraftId = value && /^\d+$/.test(value) ? Number(value) : undefined;
    const owner = currentOwnerId();
    if (!owner) return null;
    const [drafts, rows] = await Promise.all([getPostgresDrafts(), getPostgresAccounts(owner)]);
    const accounts = rows.map((row) => ({ ...row, subscriptionState: { tier: "unknown" as const, observedAt: 0, historyComplete: false } }));
    return <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Creation / editing")} title={t("Draft studio")} description={t("Manage draft text and revision history.")} /><DraftsPage initial={drafts} accounts={accounts} selectedDraftId={selectedDraftId} sourcePostId={query.externalId && /^\d{1,19}$/.test(query.externalId) ? query.externalId : undefined} /></div></main>;
  });
}
