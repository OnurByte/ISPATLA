import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getAuth } from "@/server/auth"
import { runAsOwner } from "@/server/owner-context"

export async function requirePageUser() {
  const requestHeaders = await headers()
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders })
  if (!session) redirect("/login")
  return session.user
}

export async function renderUserPage<T>(render: () => T | Promise<T>, operatorOnly = false): Promise<T> {
  const user = await requirePageUser()
  if (operatorOnly && user.id !== process.env.ISPATLA_OPERATOR_USER_ID) notFound()
  return runAsOwner(user.id, render)
}
