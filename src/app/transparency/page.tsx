import type { Metadata } from "next";
import { PublicEvidencePage, SourceLink } from "@/components/public-evidence-page";
import { requestPublicLocale } from "@/components/public-header";
import { publicMetadata } from "@/i18n/public-metadata";
import { publicEvidenceCopy, publicEvidencePageCopy } from "@/i18n/public-evidence-copy";

const path = "/transparency" as const;
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestPublicLocale();
  const copy = publicEvidencePageCopy(locale, path);
  return publicMetadata(locale, path, copy.title, copy.description);
}

export default async function TransparencyPage() {
  const locale = await requestPublicLocale();
  const copy = publicEvidenceCopy[locale];
  const page = copy.pages.transparency;
  return <PublicEvidencePage locale={locale} path={path} title={page.title} summary={page.summary} sections={[
    ...page.sections.map((section) => ({ title: section.heading, body: <p>{section.body}</p> })),
    { title: copy.common.source, body: <ul className="list-disc space-y-2 pl-5"><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/blob/main/README.md">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/blob/main/SECURITY.md">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/blob/main/docs/ARCHITECTURE.md">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="/privacy">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/issues">{copy.common.source}</SourceLink></li></ul> },
  ]} />;
}
