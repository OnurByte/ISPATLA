import { Dashboard } from "@/components/dashboard";
import { getDashboardSummary } from "@/server/dashboard";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  return renderUserPage(async () => <Dashboard initial={await getDashboardSummary()} canRunScan={false} />);
}
