import { AppShell } from "@/components/app-shell";
import { CategoriesPage } from "@/components/categories-page";
import { PageHeading } from "@/components/page-heading";
import { getAccounts, getCategoriesForAccount } from "@/server/db";
import { currentOwnerId } from "@/server/owner-context";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function CategoriesRoute() {
  return renderUserPage(() => {
    const owner = currentOwnerId()!;
    const accounts = getAccounts().filter((account) => account.ownerUserId === owner).map(({ id, handle, displayName }) => ({ id, handle, displayName }));
    const initial = accounts.length ? getCategoriesForAccount(accounts[0].id).filter((category) => category.builtIn || category.accountId === accounts[0].id) : [];
    return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Hesap ayarları / içerik" title="Kategoriler" description="Hazır konulara göz at veya seçili hesabın için özel kategori oluştur." /><CategoriesPage initial={initial} accounts={accounts} /></div></main></AppShell>;
  });
}
