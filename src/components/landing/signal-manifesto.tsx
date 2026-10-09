import Link from "next/link";
import type { SignalPressCopy } from "@/i18n/signal-press";
import { BrandLogo } from "@/components/brand-logo";
import { CostEstimate } from "@/components/landing/cost-estimate";
import { getDictionary } from "@/i18n/dictionaries";
import type { ReactNode } from "react";

export function SignalManifesto({ copy, path, startHref, children }: { copy: SignalPressCopy; path: (href: string) => string; startHref: string; children?: ReactNode }) {
  return <>
    <section id="open-source" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_.8fr] lg:items-start">
        <div><p className="press-mono text-xs tracking-[.15em] text-[#315bf5]">{copy.manifestoKicker}</p><h2 className="press-serif mt-5 max-w-3xl text-4xl leading-[.98] sm:text-6xl">{copy.manifestoTitle}</h2><p className="mt-7 max-w-2xl text-base leading-8">{copy.intro}</p>
          <Link href={startHref} className="mt-8 inline-flex min-h-12 items-center bg-[var(--press-ink)] px-5 text-sm font-bold text-[var(--press-paper)]">{getDictionary(copy.contentLocale).nav.start} →</Link>
        </div>
        <aside className="border-l-4 border-[#315bf5] ps-5 sm:ps-8"><h3 className="press-mono text-xs uppercase tracking-widest"><Link href={path("/no-viral-guarantee")} className="underline underline-offset-4">{copy.antiTitle} ↗</Link></h3><p className="mt-4 text-base leading-7">{copy.antiBody}</p><CostEstimate copy={copy} /></aside>
      </div>
    </section>
    <section className="border-y border-[#16191e]/20 bg-[#e5e1d7]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
        {[[copy.transparency, "/transparency"], [copy.research, "/research/xpatla-consumer-complaints-2026"]].map(([label, href]) => <Link key={href} href={path(href)} className="flex min-h-14 items-center justify-between border-b border-[#16191e]/30 text-sm font-semibold hover:text-[#315bf5]">{label}<span aria-hidden="true">↗</span></Link>)}
        <Link href={path("/open-source")} className="flex min-h-14 items-center justify-between border-b border-[#16191e]/30 text-sm font-semibold hover:text-[#315bf5]">{copy.install}<span aria-hidden="true">↗</span></Link>
      </div>
    </section>
    {children}
    <footer className="border-t-2 border-[#16191e] bg-[#16191e] text-[#f0ede5]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_.8fr] lg:items-center">
        <div><p className="press-mono text-xs uppercase tracking-[.17em] text-[#aebeff]">THE SIGNAL PRESS / {copy.footerLabel}</p><div className="mt-4"><BrandLogo href={path("/")} ariaLabel={getDictionary(copy.contentLocale).landing.brand} /></div><p className="mt-3 text-xs text-white/65">{copy.signature}{process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ? ` · ${process.env.NEXT_PUBLIC_GIT_COMMIT_SHA.slice(0, 7)}` : ""}</p><nav aria-label={copy.footerLabel} className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm"><Link href={path("/docs")} data-landing-event="open_source_docs" data-landing-page="/" className="underline underline-offset-4">{copy.install}</Link><Link href={path("/open-source")} className="underline underline-offset-4">{copy.repo}</Link><Link href={path("/transparency")} className="underline underline-offset-4">{copy.transparency}</Link><Link href={path("/security")} className="underline underline-offset-4">{getDictionary(copy.contentLocale).landing.security}</Link><Link href={path("/privacy")} className="underline underline-offset-4">{getDictionary(copy.contentLocale).landing.privacy}</Link><Link href={path("/terms")} className="underline underline-offset-4">{getDictionary(copy.contentLocale).landing.terms}</Link><a href="https://github.com/OnurByte/Ispatla/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" data-landing-event="github_click" data-landing-page="/" className="underline underline-offset-4">{copy.contributing}</a><a href="https://x.com/OnurStirner" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">𝕏</a></nav></div>
        <p className="max-w-sm text-sm leading-7 text-white/65">{copy.intro}</p>
      </div>
    </footer>
  </>;
}
