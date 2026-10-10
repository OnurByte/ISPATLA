import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getOnboardingRedirect } from "@/lib/onboarding-gate";
import { getPostgresOwnUserProfile } from "@/server/postgres-profile-dashboard";
import { runAsOwner } from "@/server/owner-context";
import { requirePageUser } from "@/server/page-auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  const requestHeaders = await headers();
  const route = requestHeaders.get("x-ispatla-route") || "/dashboard";
  const localeValue = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const profile = await runAsOwner(user.id, () => getPostgresOwnUserProfile());
  const destination = getOnboardingRedirect(profile.onboardingCompleted, route, locale);
  if (destination) redirect(destination);
  return children;
}
