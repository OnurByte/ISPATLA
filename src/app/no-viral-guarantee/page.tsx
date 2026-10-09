import type { Metadata } from "next";
import { PublicEvidencePage, SourceLink } from "@/components/public-evidence-page";
import { requestPublicLocale } from "@/components/public-header";
import { publicMetadata } from "@/i18n/public-metadata";
import { publicEvidenceCopy, publicEvidencePageCopy } from "@/i18n/public-evidence-copy";

const path = "/no-viral-guarantee" as const;
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestPublicLocale();
  const copy = publicEvidencePageCopy(locale, path);
  return publicMetadata(locale, path, copy.title, copy.description);
}

export default async function NoViralGuaranteePage() {
  const locale = await requestPublicLocale();
  const copy = publicEvidenceCopy[locale];
  const page = copy.pages.noViral;
  return <PublicEvidencePage locale={locale} path={path} title={page.title} summary={page.summary} sections={[
    { title: page.sections[0].heading, body: <details className="group rounded-sm border border-foreground/25 bg-background p-5"><summary className="cursor-pointer font-semibold underline decoration-foreground/35 underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">GUARANTEED VIRALITY</summary><p className="mt-4 text-2xl font-semibold tracking-tight">{page.title}</p><p className="mt-3 text-sm leading-7 text-muted-foreground">{page.sections[0].body}</p></details> },
    ...page.sections.slice(1).map((section) => ({ title: section.heading, body: <p>{section.body}</p> })),
    { title: copy.common.source, body: <ul className="list-disc space-y-2 pl-5"><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA">{copy.common.source}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/blob/main/README.md">{copy.common.source}</SourceLink></li></ul> },
  ]} />;
}
