export const metadata = { robots: { index: false, follow: true } };

import { AuthForm } from "@/components/auth-form"
import { PublicHeader, requestPublicLocale } from "@/components/public-header"

export default async function ForgotPasswordPage() {
  const locale = await requestPublicLocale()
  return <><PublicHeader locale={locale} current="forgot" /><AuthForm locale={locale} mode="forgot" /></>
}
