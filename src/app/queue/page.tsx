import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { QueuePage } from "@/components/queue-page";
import { getJobs, getPublicationIntents } from "@/server/db";

export const dynamic = "force-dynamic";

export default function QueueRoute() {
  return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Otomasyon / yürütme" title="Yayın kuyruğu" description="PublicationIntent onaylarını, x-use job’larını ve reconciliation kanıtını tek yerde yönet." /><QueuePage initial={getJobs()} initialIntents={getPublicationIntents({ limit: 200 })} /></div></main></AppShell>;
}
