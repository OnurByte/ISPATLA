import { McpGrantSettings } from "@/components/mcp-grant-settings";
import { EmailSecuritySettings } from "@/components/email-security-settings"
import { PageHeading } from "@/components/page-heading"
import { requirePageUser } from "@/server/page-auth"

export default async function SecuritySettingsPage({ searchParams }: { searchParams: Promise<{ x_error?: string }> }) {
  const user = await requirePageUser()
  const params = await searchParams
  return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10">
    <PageHeading eyebrow="Ayarlar / güvenlik" title="Hesap güvenliği" description="E-posta adresini doğrula ve hesabına erişimi koru." />
    <EmailSecuritySettings email={user.email} emailVerified={user.emailVerified} xLoginEnabled={false} xLoginError={params.x_error === "1"} />
    <McpGrantSettings owner={user.id} />
  </div></main>
}
