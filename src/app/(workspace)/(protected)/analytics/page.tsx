import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function AnalyticsRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <PageHeading eyebrow="Ölçüm / feedback" title="Hesap analitiği" description="Hesap, yayın ve public snapshot performansı." />
    <Alert><AlertDescription>Geçmiş analitiklerin PostgreSQL aktarımı henüz yapılmadı. Veri aktarılınca bu sayfada gösterilecek; şu an geçmiş sonuç gösterilmiyor.</AlertDescription></Alert>
  </div></main>);
}
