import { AuthForm } from "@/components/auth-form"
import { PublicHeader, requestPublicLocale } from "@/components/public-header"

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ x_error?: string }> }) {
  const params = await searchParams
  const locale = await requestPublicLocale()
  return <><PublicHeader locale={locale} current="signup" /><AuthForm locale={locale} mode="signup" xLoginEnabled={Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET)} xLoginError={params.x_error === "1"} /></>
}
