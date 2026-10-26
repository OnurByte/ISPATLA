import { CategoriesPage } from "@/components/categories-page";
import { PageHeading } from "@/components/page-heading";
import { currentOwnerId } from "@/server/owner-context";
import { renderUserPage } from "@/server/page-auth";
import { getPostgresAccounts, getPostgresCategoriesForAccount } from "@/server/postgres-accounts";
import { getUiText } from "@/i18n/ui";
import { requestPublicLocale } from "@/components/public-header";

export const dynamic = "force-dynamic";

export default function CategoriesRoute() {
  const locale = requestPublicLocale();
  return renderUserPage(async () => {
    const currentLocale = await locale;
    const t = (message: string, params?: Record<string, string | number>) => getUiText(currentLocale, message, params);
    const owner = currentOwnerId()!;
    const accounts = (await getPostgresAccounts(owner)).map(({ id, handle, displayName }) => ({ id, handle, displayName }));
    const initial = accounts.length ? await getPostgresCategoriesForAccount(owner, accounts[0].id) : [];
    return <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow={t("Account settings / content")} title={t("Categories")} description={t("Browse built-in topics or create a custom category for the selected account.")} /><CategoriesPage initial={initial} accounts={accounts} /></div></main>;
  });
}
