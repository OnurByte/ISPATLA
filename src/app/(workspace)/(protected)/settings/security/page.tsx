import { EmailSecuritySettings } from "@/components/email-security-settings"
import { PageHeading } from "@/components/page-heading"
import { requirePageUser } from "@/server/page-auth"

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ x_error?: string }> }) {
  const user = await requirePageUser()
  const params = await searchParams
  return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <PageHeading eyebrow="Ayarlar / güvenlik" title="Hesap güvenliği" description="E-posta adresini doğrula ve hesabına erişimi koru." />
    <EmailSecuritySettings email={user.email} emailVerified={user.emailVerified} xLoginEnabled={Boolean(process.env.X_OAUTH_CLIENT_ID && process.env.X_OAUTH_CLIENT_SECRET)} xLoginError={params.x_error === "1"} />
  </div></main>
}
