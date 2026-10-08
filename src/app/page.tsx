import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/brand-logo";
import { PublicHeader } from "@/components/public-header";
import { ArrowRight, ArrowUpRight, Check, Radio, ScanSearch, Send } from "lucide-react";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { landingMarketing } from "@/i18n/landing-marketing";
import { landingAlternates } from "@/i18n/metadata";

async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const copy = getDictionary(locale).landing;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: landingAlternates(locale),
  };
}

export default async function Home() {
  const locale = await requestLocale();
  const { landing: copy, nav } = getDictionary(locale);
  const marketing = landingMarketing[locale];
  const path = (href: string) => localizePath(locale, href);
  const steps = [
    { icon: Radio, title: copy.stepOne, description: copy.stepOneDetail },
    { icon: ScanSearch, title: copy.stepTwo, description: copy.stepTwoDetail },
    { icon: Send, title: copy.stepThree, description: copy.stepThreeDetail },
  ];
  const flow = [
    [copy.sourcePost, copy.sourceDetail],
    [copy.opportunity, copy.opportunityDetail],
    [copy.draft, copy.draftDetail],
    [copy.outcome, copy.outcomeDetail],
  ];
  const cta = "inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#e76b52] px-6 py-3 font-semibold text-[#13251b] transition-colors hover:bg-[#f08a70] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

  return <div className="min-h-screen bg-background text-foreground">
    <PublicHeader locale={locale} />
    <main className="overflow-x-clip">
      <section className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="mb-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground"><span className="size-2 rounded-full bg-[#e76b52]" aria-hidden="true" />{copy.eyebrow}</div>
        <h1 className="max-w-6xl text-[clamp(2.8rem,7.5vw,7rem)] font-black leading-[.98] tracking-[-.065em] [overflow-wrap:anywhere]">
          <span className="block">{copy.headlineFirst}</span>
          <span className="mt-3 block text-[#b9422f] dark:text-[#f08a70]">{copy.headlineSecond}</span>
        </h1>
        <div className="mt-9 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">{copy.intro}</p>
          <div className="flex flex-wrap items-center gap-5"><Link href={path("/signup")} className={cta}>{copy.createAccount}<ArrowUpRight className="size-5 rtl:-scale-x-100" aria-hidden="true" /></Link><a href="#workflow" className="inline-flex min-h-12 items-center gap-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{nav.tour}<ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /></a></div>
        </div>
      </section>

      <section aria-label={copy.flowTitle} className="bg-[#143a2c] text-[#f7f3e8]">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.65fr_1.35fr] lg:items-center">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center lg:block"><BrandLogo className="shrink-0" /><div className="min-w-0 break-words"><p className="text-xs uppercase tracking-[.17em] text-[#c8d7c9] lg:mt-6">{copy.flowLabel}</p><h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{copy.flowTitle}</h2></div></div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {flow.map(([title, detail], index) => <li key={title} className="flex min-w-0 gap-4 border border-[#c8d7c9]/25 p-5">
              <span className="pt-1 font-mono text-xs text-[#f08a70]">{String(index + 1).padStart(2, "0")}</span>
              <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#c8d7c9]">{detail}</p>{index === 3 && <span className="mt-3 inline-flex items-center gap-2 text-xs text-[#f08a70]"><Check className="size-3.5" aria-hidden="true" />{copy.proofVisible}</span>}</div>
            </li>)}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
          <h2 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{marketing.title}</h2>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{marketing.intro}</p>
        </div>
        <p className="mt-10 text-xs leading-6 text-muted-foreground">{marketing.example}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="min-w-0 rounded-xl border border-border bg-muted/30 p-6 sm:p-8"><h3 className="text-xl font-semibold text-muted-foreground">{marketing.before}</h3><p className="mt-4 text-base leading-8 text-muted-foreground">{marketing.beforeDetail}</p></article>
          <article className="min-w-0 rounded-xl border border-[#143a2c] bg-[#143a2c] p-6 text-[#f7f3e8] sm:p-8"><h3 className="text-xl font-semibold">{marketing.after}</h3><p className="mt-4 text-base leading-8 text-[#c8d7c9]">{marketing.afterDetail}</p></article>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map(({ icon: Icon, title, description }, index) => <li key={title} className="border-t border-border pt-6">
            <div className="mb-8 flex items-center justify-between"><span className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><Icon className="size-6 text-[#b9422f] dark:text-[#f08a70]" aria-hidden="true" /></div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
          </li>)}
        </ol>
      </section>

      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:gap-16">
          {[[marketing.voice, marketing.voiceDetail], [marketing.control, marketing.controlDetail]].map(([title, detail]) => <article key={title} className="min-w-0"><Check className="mb-5 size-6 text-[#b9422f] dark:text-[#f08a70]" aria-hidden="true" /><h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h2><p className="mt-5 text-base leading-7 text-muted-foreground">{detail}</p></article>)}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
        <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{marketing.faq}</h2>
        <div className="min-w-0 border-t border-border">
          {marketing.questions.map(([question, answer]) => <details key={question} className="group border-b border-border py-5"><summary className="cursor-pointer rounded-sm pe-3 text-base font-semibold leading-7 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e76b52] sm:text-lg">{question}</summary><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{answer}</p></details>)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="flex flex-col items-start gap-7 rounded-2xl border border-border bg-muted/40 p-7 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl"><h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{marketing.closing}</h2><p className="mt-5 text-base leading-7 text-muted-foreground">{marketing.closingDetail}</p></div>
          <Link href={path("/signup")} className={cta}>{copy.createAccount}<ArrowUpRight className="size-5 rtl:-scale-x-100" aria-hidden="true" /></Link>
        </div>
      </section>
    </main>
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>ispatla.tr · Social AI HitMaker</span>
        <nav aria-label={copy.trustLabel} className="flex flex-wrap gap-x-5 gap-y-3">{[["/docs", nav.tour], ["/security", copy.security], ["/privacy", copy.privacy], ["/terms", copy.terms]].map(([href, label]) => <Link key={href} href={path(href)} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{label}</Link>)}<a href="https://github.com/OnurByte/Ispatla" target="_blank" rel="noreferrer" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{copy.sourceCode}</a></nav>
      </div>
    </footer>
  </div>;
}
