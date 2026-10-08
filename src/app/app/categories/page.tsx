import { AppShell } from "@/components/app-shell";
import { CategoriesPage } from "@/components/categories-page";
import { PageHeading } from "@/components/page-heading";
import { getCategories } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function CategoriesRoute() {
  return renderUserPage(() => <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Operasyon / kategoriler" title="Kategori motoru" description="Custom kategori, strateji ve seed kaynaklarını burada yönet." /><CategoriesPage initial={getCategories()} /></div></main></AppShell>);
}
