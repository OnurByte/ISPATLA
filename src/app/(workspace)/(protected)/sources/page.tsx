import { PageHeading } from "@/components/page-heading";
import { SourcesPage } from "@/components/sources-page";
import { loadSourceCatalog } from "@/server/source-catalog";
import { getUiText } from "@/i18n/ui";
import { requestPublicLocale } from "@/components/public-header";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresAccountSources } from "@/server/postgres-sources-market";

export const dynamic = "force-dynamic";

export default function SourcesRoute() {
  const locale = requestPublicLocale();
  return renderUserPage(async () => {
    const currentLocale = await locale;
    const t = (message: string, params?: Record<string, string | number>) => getUiText(currentLocale, message, params);
    const accounts = await getPostgresAccounts(currentOwnerId()!);
    const initial = accounts[0] ? await getPostgresAccountSources(currentOwnerId()!, accounts[0].id) : [];
    return <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Operations / intake")} title={t("Sources and niches")} description={t("Choose and edit sources separately for each publishing account.")} /><SourcesPage accounts={accounts.map(({ id, handle, displayName }) => ({ id, handle, displayName }))} initial={initial} initialAvailable={loadSourceCatalog().filter((source) => !initial.some((selected) => selected.handle === source.handle))} initialDeleted={[]} initialWarnings={[]} /></div></main>;
  });
}
