import Link from "next/link";
import type { SignalPressCopy } from "@/i18n/signal-press";
import { BrandLogo } from "@/components/brand-logo";
import { CostEstimate } from "@/components/landing/cost-estimate";
import { getDictionary } from "@/i18n/dictionaries";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, ArrowUpRight, Info } from "lucide-react";
import type { ReactNode } from "react";

export function SignalManifesto({ copy, path, startHref, children }: { copy: SignalPressCopy; path: (href: string) => string; startHref: string; children?: ReactNode }) {
  const dictionary = getDictionary(copy.contentLocale);
  return <>
    <section id="open-source" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_.8fr] lg:items-start">
        <div className="flex flex-col items-start gap-8">
          <h2 className="max-w-3xl text-4xl leading-tight sm:text-6xl">{copy.manifestoTitle}</h2>
          <Link href={startHref} className={buttonVariants({ size: "lg", className: "min-h-11 px-5" })}>{dictionary.nav.start}<ArrowRight aria-hidden="true" data-icon="inline-end" /></Link>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <Alert><Info aria-hidden="true" /><AlertTitle><Link href={path("/no-viral-guarantee")} className="underline underline-offset-4">{copy.antiTitle}</Link></AlertTitle><AlertDescription>{copy.antiBody}</AlertDescription></Alert>
          <CostEstimate copy={copy} />
        </aside>
      </div>
    </section>
    <Separator />
    <section className="bg-muted">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-4 px-5 py-8 sm:px-8">
        {[[copy.transparency, "/transparency"], [copy.install, "/open-source"]].map(([label, href]) => <Link key={href} href={path(href)} className={buttonVariants({ variant: "outline", size: "lg", className: "h-auto min-h-11 whitespace-normal" })}>{label}<ArrowUpRight aria-hidden="true" data-icon="inline-end" /></Link>)}
      </div>
    </section>
    {children}
    <Separator />
    <footer className="bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-12 sm:px-8">
        <BrandLogo href={path("/")} ariaLabel={dictionary.landing.brand} />
        <nav aria-label={dictionary.landing.menuLabel} className="flex flex-wrap gap-2">
          {[[copy.install, "/docs"], [copy.repo, "/open-source"], [copy.transparency, "/transparency"], [dictionary.landing.security, "/security"], [dictionary.landing.privacy, "/privacy"], [dictionary.landing.terms, "/terms"]].map(([label, href]) => <Link key={href} href={path(href)} data-landing-event={href === "/docs" ? "open_source_docs" : undefined} data-landing-page={href === "/docs" ? "/" : undefined} className={buttonVariants({ variant: "link", className: "min-h-11" })}>{label}</Link>)}
          <a href="https://github.com/OnurByte/Ispatla/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" data-landing-event="github_click" data-landing-page="/" className={buttonVariants({ variant: "link", className: "min-h-11" })}>{copy.contributing}</a>
          <a href="https://x.com/OnurStirner" target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "link", className: "min-h-11" })}>𝕏</a>
        </nav>
      </div>
    </footer>
  </>;
}
