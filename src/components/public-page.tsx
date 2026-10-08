import Link from "next/link";
import type { ReactNode } from "react";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export async function PublicPage({ title, summary, children, current }: { title: string; summary: string; children: ReactNode; current?: "docs" }) {
  const locale = await requestPublicLocale();
  const { nav, landing } = getDictionary(locale);
  const path = (href: string) => localizePath(locale, href);
  const links = [["/docs", nav.tour], ["/security", landing.security], ["/privacy", landing.privacy], ["/terms", landing.terms]] as const;
  return <div className="min-h-screen bg-background text-foreground">
    <PublicHeader locale={locale} current={current} />
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{landing.trustLabel}</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{summary}</p>
      <nav aria-label={landing.trustLabel} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-5 text-sm">
        {links.map(([href, label]) => <Link key={href} href={path(href)} className="min-h-11 py-3 underline decoration-border underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{label}</Link>)}
      </nav>
      <div className="mt-10 grid gap-9 lg:grid-cols-[minmax(0,46rem)_1fr]">{children}</div>
    </main>
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 px-5 py-7 text-xs text-muted-foreground sm:px-8">
        <Link href={path("/")} className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">ispatla.tr · Social AI HitMaker</Link>
        <a href="https://github.com/OnurByte/Ispatla" target="_blank" rel="noreferrer" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{landing.sourceCode} · AGPL-3.0-or-later</a>
      </div>
    </footer>
  </div>;
}

export function PublicSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-3"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><div className="space-y-3 text-sm leading-7 text-muted-foreground">{children}</div></section>;
}
