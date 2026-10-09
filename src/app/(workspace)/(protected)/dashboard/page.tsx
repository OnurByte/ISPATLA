import { Dashboard } from "@/components/dashboard";
import { getDashboardSummary } from "@/server/dashboard";
import { renderUserPage } from "@/server/page-auth";
import { currentOwnerId } from "@/server/owner-context";

export const dynamic = "force-dynamic";

export default function Home() {
  return renderUserPage(() => <Dashboard initial={getDashboardSummary()} canRunScan={currentOwnerId() === process.env.ISPATLA_OPERATOR_USER_ID} />);
}
