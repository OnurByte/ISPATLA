import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/public-header";
import { SignalExperience } from "@/components/landing/signal-experience";
import { GrowthScene } from "@/components/landing/growth-scene";
import { SignalManifesto } from "@/components/landing/signal-manifesto";
import { getSignalPressCopy } from "@/i18n/signal-press";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/i18n/config";
import { publicMetadata } from "@/i18n/public-metadata";
import { LandingEventObserver } from "@/components/landing/landing-event-observer";
import { getDictionary } from "@/i18n/dictionaries";
import { EXCUSE_CAMPAIGN } from "@/i18n/excuse-campaign";
import { getOptionalPageUser, hasPageSessionCookie } from "@/server/page-auth";
import "@/styles/landing-tokens.css";

async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const copy = getSignalPressCopy(locale);
  return publicMetadata(locale, "/", `${copy.headline} ${copy.headlineAccent} · ISPATLA`, copy.intro);
}

export default async function Home() {
  const locale = await requestLocale();
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); }
  catch { authenticated = await hasPageSessionCookie(); }
  const copy = getSignalPressCopy(locale);
  const path = (href: string) => localizePath(locale, href);
  const startHref = path(authenticated ? "/dashboard" : "/signup");
  const flowTitle = getDictionary(locale).landing.flowTitle;
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ISPATLA",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: copy.intro,
    softwareVersion: "In development",
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    codeRepository: "https://github.com/OnurByte/Ispatla",
  };

  return <div className="signal-press min-h-screen">
    <LandingEventObserver />
    <PublicHeader locale={locale} authenticated={authenticated} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }} />
    <main>
      <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16 lg:grid-cols-[.9fr_1.1fr]">
        <div lang={locale} className="relative z-10">
          <h1 className="press-serif max-w-3xl text-[clamp(3rem,7.4vw,6.5rem)] leading-[.86] tracking-[-.055em]">{copy.headline}<span className="mt-4 block text-[#315bf5]">{copy.headlineAccent}</span></h1>
          <p className="mt-8 max-w-xl text-base leading-7 sm:text-lg sm:leading-8">{copy.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><a href="#signal-detector" className="inline-flex min-h-12 items-center gap-3 bg-[#315bf5] px-5 text-sm font-bold text-white hover:bg-[#2448d8]">{copy.explore}<span aria-hidden="true">↓</span></a><Link href={startHref} className="inline-flex min-h-12 items-center border border-[#16191e]/40 px-5 text-sm font-bold hover:bg-white/50">{getDictionary(locale).nav.start}</Link></div>
          <div className="press-mono mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#16191e]/25 pt-4 text-[10px] uppercase tracking-wider"><a href="#signal-detector" className="hover:text-[#315bf5]">{copy.issue}</a><a href="#writing-room" className="hover:text-[#315bf5]">{copy.writingTitle}</a><a href="#proof-room" className="hover:text-[#315bf5]">{EXCUSE_CAMPAIGN[locale].title}</a></div>
        </div>
        <GrowthScene locale={locale} copy={copy} />
      </section>
      <SignalExperience copy={copy} startHref={startHref} />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"><div className="grid gap-6 md:grid-cols-[.8fr_1.2fr]"><div><p className="press-mono text-xs uppercase tracking-widest text-[#315bf5]">{copy.manifestoKicker}</p><h2 className="press-serif mt-4 text-4xl leading-none sm:text-6xl">{flowTitle}</h2></div><p className="max-w-2xl text-base leading-8">{copy.intro} <Link href={path("/transparency")} className="font-bold text-[#315bf5] underline underline-offset-4">{copy.transparency}</Link></p></div></section>
      <SignalManifesto copy={copy} path={path} startHref={startHref} />
    </main>
  </div>;
}
