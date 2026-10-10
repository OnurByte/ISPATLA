import { CategoriesPage } from "@/components/categories-page";
import { PageHeading } from "@/components/page-heading";
import { currentOwnerId } from "@/server/owner-context";
import { renderUserPage } from "@/server/page-auth";
import { getPostgresAccounts, getPostgresCategoriesForAccount } from "@/server/postgres-accounts";

export const dynamic = "force-dynamic";

export default function CategoriesRoute() {
  return renderUserPage(async () => {
    const owner = currentOwnerId()!;
    const accounts = (await getPostgresAccounts(owner)).map(({ id, handle, displayName }) => ({ id, handle, displayName }));
    const initial = accounts.length ? await getPostgresCategoriesForAccount(owner, accounts[0].id) : [];
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Hesap ayarları / içerik" title="Kategoriler" description="Hazır konulara göz at veya seçili hesabın için özel kategori oluştur." /><CategoriesPage initial={initial} accounts={accounts} /></div></main>;
  });
}
