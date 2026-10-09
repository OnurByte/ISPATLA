import { DraftsPage } from "@/components/drafts-page";
import { PageHeading } from "@/components/page-heading";
import { getAccounts, getDrafts } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function DraftsRoute({ searchParams }: { searchParams: Promise<{ draft?: string | string[] }> }) {
  return renderUserPage(async () => {
    const query = await searchParams;
    const value = Array.isArray(query.draft) ? query.draft[0] : query.draft;
    const selectedDraftId = value && /^\d+$/.test(value) ? Number(value) : undefined;
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Üretim / edit" title="Draft stüdyosu" description="Market fırsatını hesap stiline göre üret, düzenle, gate sonucunu gör ve gerçek yayın kuyruğuna gönder." /><DraftsPage initial={getDrafts()} accounts={getAccounts()} selectedDraftId={selectedDraftId} /></div></main>;
  });
}
