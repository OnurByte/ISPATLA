import { MarketPage } from "@/components/market-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { getPostgresMarketInbox } from "@/server/postgres-sources-market";

export const dynamic = "force-dynamic";

export default function OpportunitiesRoute() {
  return renderUserPage(async () => <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow="Market / discovery" title="Opportunities" description="Review opportunity, observed, and rejected posts separately; create drafts only from eligible candidates." /><MarketPage initial={await getPostgresMarketInbox(currentOwnerId()!, { view: "opportunities" })} accounts={await getPostgresAccounts(currentOwnerId()!)} /></div></main>);
}
