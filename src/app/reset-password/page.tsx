import { AuthForm } from "@/components/auth-form"
import { PublicHeader, requestPublicLocale } from "@/components/public-header"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  const locale = await requestPublicLocale()
  return <><PublicHeader locale={locale} current="reset" /><AuthForm locale={locale} mode="reset" token={typeof token === "string" ? token : undefined} /></>
}
