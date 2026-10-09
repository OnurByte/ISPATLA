import { PageHeading } from "@/components/page-heading";
import { SourcesPage } from "@/components/sources-page";
import { getAccountSources, getAccounts } from "@/server/db";
import { loadSources } from "@/server/sources";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function SourcesRoute() {
  return renderUserPage(() => {
    const accounts = getAccounts();
    const initial = accounts[0] ? getAccountSources(accounts[0].id) : [];
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Operasyon / intake" title="Kaynaklar ve nişler" description="Her yayın hesabının kaynaklarını ayrı seç ve düzenle." /><SourcesPage accounts={accounts.map(({ id, handle, displayName }) => ({ id, handle, displayName }))} initial={initial} initialAvailable={loadSources().filter((source) => !initial.some((selected) => selected.handle === source.handle))} initialDeleted={[]} initialWarnings={[]} /></div></main>;
  });
}
