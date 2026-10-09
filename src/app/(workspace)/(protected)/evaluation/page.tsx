import { EvaluationPage } from "@/components/evaluation-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function EvaluationRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Kanıt / değerlendirme" title="Karar değerlendirme masası" description="Hesap ve model bazında gecikmiş adayları, insan etiketlerini, gözlenen sonuçları ve kalibrasyon kanıtını inceleyin." /><EvaluationPage /></div></main>);
}
