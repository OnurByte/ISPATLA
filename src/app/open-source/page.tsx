import type { Metadata } from "next";
import Link from "next/link";
import { LandingEventObserver } from "@/components/landing/landing-event-observer";
import { localizePath } from "@/i18n/config";
import { getSignalPressCopy } from "@/i18n/signal-press";
import { PublicEvidencePage, SourceLink } from "@/components/public-evidence-page";
import { requestPublicLocale } from "@/components/public-header";
import { publicMetadata } from "@/i18n/public-metadata";
import { publicEvidenceCopy, publicEvidencePageCopy } from "@/i18n/public-evidence-copy";

const path = "/open-source" as const;
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestPublicLocale();
  const copy = publicEvidencePageCopy(locale, path);
  return publicMetadata(locale, path, copy.title, copy.description);
}

export default async function OpenSourcePage() {
  const locale = await requestPublicLocale();
  const copy = publicEvidenceCopy[locale];
  const page = copy.pages.openSource;
  const source = copy.common.source;
  return <><LandingEventObserver page={path} /><PublicEvidencePage locale={locale} path={path} title={page.title} summary={page.summary} sections={[
    ...page.sections.map((section) => ({ title: section.heading, body: <p>{section.body}</p> })),
    { title: getSignalPressCopy(locale).install, body: <Link href={localizePath(locale, "/docs")} data-landing-event="open_source_docs" data-landing-page={path} className="underline underline-offset-4">{getSignalPressCopy(locale).install} →</Link> },
    { title: source, body: <ul className="list-disc space-y-2 pl-5"><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA">GitHub · ISPATLA ({source})</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/blob/main/LICENSE">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://www.gnu.org/licenses/agpl-3.0.html">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA#katk%C4%B1c%C4%B1-demosu">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/issues">{copy.common.source}</SourceLink></li></ul> },
  ]} /></>;
}
