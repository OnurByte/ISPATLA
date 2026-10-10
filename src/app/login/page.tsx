import { AuthForm } from "@/components/auth-form"
import { PublicHeader, PublicHeaderContent, requestPublicLocale } from "@/components/public-header"
import { getOptionalPageUser, hasPageSessionCookie } from "@/server/page-auth"
import { redirect } from "next/navigation"
import { localizePath } from "@/i18n/config"
import { authCopy } from "@/i18n/auth-copy"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ x_error?: string; error?: string | string[]; next?: string | string[] }> }) {
  const params = await searchParams
  const locale = await requestPublicLocale()
  let authUnavailable = false
  try {
    if (await getOptionalPageUser()) redirect(localizePath(locale, "/dashboard"))
  } catch {
    if (await hasPageSessionCookie()) redirect(localizePath(locale, "/dashboard"))
    authUnavailable = true
  }
  if (authUnavailable) return <><PublicHeaderContent locale={locale} current="login" authenticated={false} /><main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">{authCopy[locale].signInUnavailable}</h1><p className="mt-3 text-muted-foreground">{authCopy[locale].signInRetry}</p></main></>
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") && !params.next.includes("\\") ? params.next : "/dashboard"
  return <><PublicHeader locale={locale} current="login" /><AuthForm locale={locale} mode="login" next={localizePath(locale, next)} xLoginEnabled={Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET)} xLoginError={typeof params.error === "string" ? params.error : params.x_error === "1"} /></>
}
