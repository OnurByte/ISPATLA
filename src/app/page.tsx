import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/public-header";
import { SignalExperience } from "@/components/landing/signal-experience";
import { TweetCard } from "@/components/landing/tweet-card";
import { SignalManifesto } from "@/components/landing/signal-manifesto";
import { MathCampaign } from "@/components/landing/math-campaign";
import { getSignalPressCopy } from "@/i18n/signal-press";
import { DEFAULT_LOCALE, isLocale, localizePath, LOCALE_CONFIG, type Locale } from "@/i18n/config";
import { publicMetadata } from "@/i18n/public-metadata";
import { LandingEventObserver } from "@/components/landing/landing-event-observer";
import { getDictionary } from "@/i18n/dictionaries";
import { getMathCampaignCopy } from "@/i18n/math-campaign";
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
  const mathCampaignCopy = getMathCampaignCopy(locale);
  const path = (href: string) => localizePath(locale, href);
  const startHref = path(authenticated ? "/dashboard" : "/signup");
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

  return <div className="signal-press min-h-screen bg-background text-foreground">
    <LandingEventObserver />
    <PublicHeader locale={locale} authenticated={authenticated} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }} />
    <main>
      <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16 lg:grid-cols-[.9fr_1.1fr]">
        <div lang={locale} className="relative z-10">
          <h1 className="max-w-3xl text-[clamp(2.75rem,6vw,5.5rem)] leading-[1.02] tracking-[-.035em]">{copy.headline}<span className="mt-4 block text-primary">{copy.headlineAccent}</span></h1>
          <p className="mt-8 max-w-xl text-base leading-7 sm:text-lg sm:leading-8">{copy.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><a href="#signal-detector" className={buttonVariants({ size: "lg" })}>{copy.explore}<ArrowDown aria-hidden="true" data-icon="inline-end" /></a><Link href={startHref} className={buttonVariants({ variant: "outline", size: "lg" })}>{getDictionary(locale).nav.start}</Link></div>
        </div>
        <div lang={locale} dir={LOCALE_CONFIG[locale].dir} className="min-w-0">
          <TweetCard source={copy.examples[0].source} synthetic={copy.synthetic}>{copy.examples[0].post}</TweetCard>
          <div className="mt-5 flex flex-col gap-4"><Separator />
            <p className="text-sm font-bold text-primary">{copy.accepted}</p>
            <p className="mt-2 max-w-xl text-sm leading-6">{copy.examples[0].reason}</p>
            <a href="#writing-room" className={buttonVariants({ variant: "link", className: "self-start" })}>{copy.inspect}<ArrowRight aria-hidden="true" data-icon="inline-end" /></a>
          </div>
        </div>
      </section>
      <SignalExperience copy={copy} startHref={startHref} />
      <MathCampaign locale={locale} dir={LOCALE_CONFIG[locale].dir} copy={mathCampaignCopy} startHref={startHref} />
      <SignalManifesto copy={copy} path={path} startHref={startHref} />
    </main>
  </div>;
}
