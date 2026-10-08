import { Dashboard } from "@/components/dashboard";
import { AppShell } from "@/components/app-shell";
import { getDashboardSummary } from "@/server/dashboard";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function Home() {
  return renderUserPage(() => <AppShell><Dashboard initial={getDashboardSummary()} /></AppShell>);
}
