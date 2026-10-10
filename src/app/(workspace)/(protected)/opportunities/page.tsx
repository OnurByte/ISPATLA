import { MarketPage } from "@/components/market-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresMarketInbox } from "@/server/postgres-sources-market";

export const dynamic = "force-dynamic";

export default function OpportunitiesRoute() {
  return renderUserPage(async () => <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Market / keşif" title="Fırsatlar" description="Fırsat, gözlenen ve elenen postları ayrı incele; yalnız uygun adaylardan draft üret." /><MarketPage initial={await getPostgresMarketInbox(currentOwnerId()!, { view: "opportunities" })} accounts={await getPostgresAccounts(currentOwnerId()!)} /></div></main>);
}
