import type { Metadata } from "next";
import { headers } from "next/headers";
import { CampaignLanding } from "@/components/landing/campaign-landing";
import { LandingEventObserver } from "@/components/landing/landing-event-observer";
import { getCampaignLandingCopy } from "@/i18n/campaign-landing";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { publicMetadata } from "@/i18n/public-metadata";
import { getOptionalPageUser } from "@/server/page-auth";
import "@/styles/campaign-landing.css";

async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const copy = getCampaignLandingCopy(locale);
  return publicMetadata(locale, "/", `${copy.headline} ${copy.headlineAccent} ⁜ ispatla.tr`, copy.intro);
}

export default async function Home() {
  const locale = await requestLocale();
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); }
  catch { /* Public marketing remains available when the session service is offline. */ }
  const copy = getCampaignLandingCopy(locale);
  const softwareApplication = {
    "@context": "https://schema.org", "@type": "SoftwareApplication",
    name: "ispatla.tr", applicationCategory: "BusinessApplication", operatingSystem: "Web",
    description: copy.intro, url: "https://ispatla.tr",
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    codeRepository: "https://github.com/OnurByte/ISPATLA",
  };
  return <>
    <LandingEventObserver />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication).replace(/</g, "\\u003c") }} />
    <CampaignLanding locale={locale} copy={copy} authenticated={authenticated} />
  </>;
}
