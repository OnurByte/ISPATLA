import { AuthForm } from "@/components/auth-form"
import { PublicHeader, requestPublicLocale } from "@/components/public-header"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ x_error?: string }> }) {
  const params = await searchParams
  const locale = await requestPublicLocale()
  return <><PublicHeader locale={locale} current="login" /><AuthForm locale={locale} mode="login" xLoginEnabled={Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET)} xLoginError={params.x_error === "1"} /></>
}
