import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getSessionCookie } from "better-auth/cookies"
import { getAuth, isAuthenticatedUserDisabled } from "@/server/auth"
import { runAsOwner } from "@/server/owner-context"

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
  if (!user) redirect("/login")
  return user
}

export async function renderUserPage<T>(render: () => T | Promise<T>, operatorOnly = false): Promise<T> {
  const user = await requirePageUser()
  if (operatorOnly && user.id !== process.env.ISPATLA_OPERATOR_USER_ID) notFound()
  return runAsOwner(user.id, render)
}
