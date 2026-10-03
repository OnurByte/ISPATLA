import { AppShell } from "@/components/app-shell";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { onboardingSteps } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/**
 * The onboarding screen renders only while a required step is open. Once the X
 * connection and the account exist the dashboard redirects away from here, so a
 * configured install never lands on this page again.
 */
export default function OnboardingRoute() {
  const steps = onboardingSteps();
  const outstanding = steps.filter((step) => step.required && !step.done);
  return (
    <AppShell>
      <main className="min-h-screen">
        <OnboardingScreen
          initial={{
            steps,
            incomplete: outstanding.length > 0,
            outstanding: outstanding.map((step) => step.id),
          }}
        />
      </main>
    </AppShell>
  );
}