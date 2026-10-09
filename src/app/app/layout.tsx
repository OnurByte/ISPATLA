import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getOwnUserProfile } from "@/server/db"
import { runAsOwner } from "@/server/owner-context"
import { requirePageUser } from "@/server/page-auth"
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config"
import { getOnboardingRedirect } from "@/lib/onboarding-gate"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser()
  const requestHeaders = await headers()
  const route = requestHeaders.get("x-ispatla-route") || "/app"
  const localeValue = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE
  const profile = await runAsOwner(user.id, () => getOwnUserProfile())
  const destination = getOnboardingRedirect(profile.onboardingCompleted, route, locale)
  if (destination) redirect(destination)
  return children
}
