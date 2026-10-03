import { Dashboard } from "@/components/dashboard";
import { AppShell } from "@/components/app-shell";
import { getDashboardSummary } from "@/server/dashboard";
import { needsOnboarding } from "@/server/onboarding";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  // A not-yet-configured install has nothing to show on the dashboard, so it goes
  // straight to onboarding instead of rendering an empty shell full of zeroes.
  // Once the required steps are done this is a no-op and the dashboard is the
  // landing page again.
  if (needsOnboarding()) redirect("/onboarding");
  return <AppShell><Dashboard initial={getDashboardSummary()} /></AppShell>;
}