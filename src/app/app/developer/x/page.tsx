import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-heading";
import { XInspectorPage } from "@/components/x-inspector-page";
import { renderUserPage } from "@/server/page-auth";
export const dynamic = "force-dynamic";
export default function XRoute() { return renderUserPage(() => <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Hesap / X" title="X timeline incelemesi" description="Resmi X API ile bağlı hesabınızın kendi timeline’ını salt okunur inceleyin." /><XInspectorPage /></div></main></AppShell>); }
