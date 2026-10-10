import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getSessionCookie } from "better-auth/cookies"
import { getAuth, isAuthenticatedUserDisabled } from "@/server/auth"
import { runAsOwner } from "@/server/owner-context"
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config"

export async function getOptionalPageUser() {
  const requestHeaders = await headers()
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders })
  if (!session || await isAuthenticatedUserDisabled(session.user.id)) return null
  return session.user
}

/** Cookie presence is only a fail-closed navigation hint; page/API authorization still verifies the DB session. */
export async function hasPageSessionCookie() {
  return Boolean(getSessionCookie(await headers()))
}

export async function requirePageUser() {
  const user = await getOptionalPageUser()
  if (!user) {
    const requestHeaders = await headers()
    const route = requestHeaders.get("x-ispatla-route") || "/dashboard"
    const search = requestHeaders.get("x-ispatla-search") || ""
    const localeValue = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE
    const next = `${localizePath(locale, route)}${search}`
    redirect(`${localizePath(locale, "/login")}?next=${encodeURIComponent(next)}`)
  }
  return user
}

export async function renderUserPage<T>(render: () => T | Promise<T>, operatorOnly = false): Promise<T> {
  const user = await requirePageUser()
  if (operatorOnly && user.id !== process.env.ISPATLA_OPERATOR_USER_ID) notFound()
  return runAsOwner(user.id, render)
}
