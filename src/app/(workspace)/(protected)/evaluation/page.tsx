import { EvaluationPage } from "@/components/evaluation-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function EvaluationRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow="Kanıt / değerlendirme" title="Karar değerlendirme masası" description="Hesap ve model bazında gecikmiş adayları, insan etiketlerini, gözlenen sonuçları ve kalibrasyon kanıtını inceleyin." /><EvaluationPage /></div></main>);
}
