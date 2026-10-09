import Link from "next/link";
import { headers } from "next/headers";
import { ChevronRight } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountLifecycleControls } from "@/components/account-lifecycle-controls";
import { PageHeading } from "@/components/page-heading";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageUser } from "@/server/page-auth";

export default async function SettingsPage() {
  await requirePageUser();
  const requestedLocale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const nav = getDictionary(locale).nav;
  const groups = [
    { title: "Tercihler", items: [[nav.appearance, "/settings/appearance"], [nav.style, "/settings/style"]] },
    { title: "Hesap ve paylaşım", items: [[nav.security, "/settings/security"]] },
    { title: "AI ve otomasyon", items: [[nav.keys, "/settings/keys"], [nav.automation, "/settings/automation"]] },
  ] as const;

  return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <PageHeading eyebrow="Çalışma alanı" title="Ayarlar" description="Görünümünü, hesabını ve çalışma tercihlerini yönet." />
    <div className="grid gap-8 sm:grid-cols-2">
      {groups.map((group) => <section key={group.title} className="space-y-3"><h2 className="text-base font-semibold">{group.title}</h2><nav aria-label={group.title} className="divide-y rounded-md border bg-card">{group.items.map(([label, href]) => <Link key={href} href={localizePath(locale, href)} className="flex min-h-12 items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}<ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" /></Link>)}</nav></section>)}
    </div>
    <section className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-medium">Oturum</h2><p className="text-sm text-muted-foreground">Bu cihazdaki hesabından çıkış yap.</p></div><div className="sm:w-44"><SignOutButton locale={locale} /></div></section>
    <AccountLifecycleControls />
  </div></main>;
}
