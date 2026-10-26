import { PageHeading } from "@/components/page-heading";
import { SourcesPage } from "@/components/sources-page";
import { loadSourceCatalog } from "@/server/source-catalog";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresAccountSources } from "@/server/postgres-sources-market";

export const dynamic = "force-dynamic";

export default function SourcesRoute() {
  return renderUserPage(async () => {
    const accounts = await getPostgresAccounts(currentOwnerId()!);
    const initial = accounts[0] ? await getPostgresAccountSources(currentOwnerId()!, accounts[0].id) : [];
    return <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow="Operasyon / intake" title="Kaynaklar ve nişler" description="Her yayın hesabının kaynaklarını ayrı seç ve düzenle." /><SourcesPage accounts={accounts.map(({ id, handle, displayName }) => ({ id, handle, displayName }))} initial={initial} initialAvailable={loadSourceCatalog().filter((source) => !initial.some((selected) => selected.handle === source.handle))} initialDeleted={[]} initialWarnings={[]} /></div></main>;
  });
}
