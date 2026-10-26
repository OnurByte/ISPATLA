import Link from "next/link";
import { BrandText, brandProse } from "@/components/brand-text";
import { PublicFooter } from "@/components/public-footer";
import { publicUiCopy } from "@/i18n/public-ui-copy";
import type { ReactNode } from "react";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export async function PublicPage({ title, summary, children, current }: { title: string; summary: string; children: ReactNode; current?: "docs" }) {
  const locale = await requestPublicLocale();
  const { landing } = getDictionary(locale);
  const path = (href: string) => localizePath(locale, href);
  const links = [["/docs", publicUiCopy[locale].docs], ["/security", landing.security], ["/privacy", landing.privacy], ["/terms", landing.terms]] as const;
  return <div className="min-h-screen bg-background text-foreground">
    <PublicHeader locale={locale} current={current} />
    <main className="site-container pb-16 pt-10 sm:pt-16">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{landing.trustLabel}</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"><BrandText text={title} /></h1>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground"><BrandText text={summary} /></p>
      <nav aria-label={landing.trustLabel} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-6 text-sm">
        {links.map(([href, label]) => <Link key={href} href={path(href)} className="min-h-11 py-3 underline decoration-border underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{label}</Link>)}
      </nav>
      <div className="mt-10 grid grid-cols-1 gap-8 *:min-w-0 lg:grid-cols-[minmax(0,46rem)_1fr]">{children}</div>
    </main>
    <PublicFooter locale={locale} />
  </div>;
}

export function PublicSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="min-w-0 space-y-3"><h2 className="text-xl font-semibold tracking-tight"><BrandText text={title} /></h2><div className="space-y-3 text-sm leading-7 text-muted-foreground">{brandProse(children)}</div></section>;
}
