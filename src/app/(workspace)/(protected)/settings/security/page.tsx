import { McpGrantSettings } from "@/components/mcp-grant-settings";
import { EmailSecuritySettings } from "@/components/email-security-settings"
import { PageHeading } from "@/components/page-heading"
import { requirePageUser } from "@/server/page-auth"
import { requestPublicLocale } from "@/components/public-header"
import { getUiText } from "@/i18n/ui"

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ x_error?: string }> }) {
  const user = await requirePageUser()
  const params = await searchParams
  const locale = await requestPublicLocale()
  const t = (message: string) => getUiText(locale, message)
  return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10">
    <PageHeading eyebrow={t("Settings / security")} title={t("Account security")} description={t("Verify your email address and protect access to your account.")} />
    <EmailSecuritySettings email={user.email} emailVerified={user.emailVerified} xLoginEnabled={false} xLoginError={params.x_error === "1"} />
    <McpGrantSettings owner={user.id} />
  </div></main>
}
