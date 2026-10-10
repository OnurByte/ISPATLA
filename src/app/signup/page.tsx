export const metadata = { robots: { index: false, follow: true } };

import { AuthForm } from "@/components/auth-form"
import { PublicHeader, PublicHeaderContent, requestPublicLocale } from "@/components/public-header"
import { getOptionalPageUser, hasPageSessionCookie } from "@/server/page-auth"
import { redirect } from "next/navigation"
import { localizePath } from "@/i18n/config"

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ x_error?: string; error?: string | string[] }> }) {
  const params = await searchParams
  const locale = await requestPublicLocale()
  let authUnavailable = false
  try {
    if (await getOptionalPageUser()) redirect(localizePath(locale, "/dashboard"))
  } catch {
    if (await hasPageSessionCookie()) redirect(localizePath(locale, "/dashboard"))
    authUnavailable = true
  }
  if (authUnavailable) return <><PublicHeaderContent locale={locale} current="signup" authenticated={false} /><main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">{locale === "tr" ? "Oturum kontrolü geçici olarak kullanılamıyor" : "Sign-in is temporarily unavailable"}</h1><p className="mt-3 text-muted-foreground">{locale === "tr" ? "Biraz sonra sayfayı yenileyip tekrar dene." : "Refresh this page and try again shortly."}</p></main></>
  return <><PublicHeader locale={locale} current="signup" /><AuthForm locale={locale} mode="signup" xLoginEnabled={Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET)} xLoginError={typeof params.error === "string" ? params.error : params.x_error === "1"} /></>
}
