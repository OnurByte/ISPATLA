import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { SourcesPage } from "@/components/sources-page";
import { getDeletedSources, getTechnicalSourceWarnings } from "@/server/db";
import { ideologyOptions } from "@/server/ideologies";
import { loadSources } from "@/server/sources";

export const dynamic = "force-dynamic";

export default function SourcesRoute() {
  return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Operasyon / intake" title="Kaynaklar ve nişler" description="İzlenen hesapları, hak durumunu ve intake derinliğini canlı olarak düzenle." /><SourcesPage initial={loadSources()} initialDeleted={getDeletedSources()} initialWarnings={getTechnicalSourceWarnings()} ideologies={ideologyOptions()} /></div></main></AppShell>;
}
