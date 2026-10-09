import type { Metadata } from "next";
import { EvidenceStateLabel, PublicEvidencePage, SourceLink } from "@/components/public-evidence-page";
import { requestPublicLocale } from "@/components/public-header";
import { complaintEvidence } from "@/content/comparisons/evidence";
import { publicMetadata } from "@/i18n/public-metadata";
import { publicEvidenceCopy } from "@/i18n/public-evidence-copy";

const path = "/research/xpatla-consumer-complaints-2026";
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestPublicLocale();
  const page = publicEvidenceCopy[locale].pages.research;
  return publicMetadata(locale, path, page.title, page.description);
}

export default async function XpatlaResearchPage() {
  const locale = await requestPublicLocale();
  const copy = publicEvidenceCopy[locale];
  const page = copy.pages.research;
  return <PublicEvidencePage locale={locale} path={path} title={page.title} summary={page.summary} sections={[
    { title: page.sections[0].heading, body: <><p>{page.sections[0].body}</p><blockquote className="mt-5 border-s-4 border-primary bg-muted p-5 text-lg font-medium">{copy.researchHook}</blockquote></> },
    { title: copy.common.checked, body: <div className="space-y-7">{complaintEvidence.map((item, index) => <article key={item.id} className="border-s-2 border-primary/50 ps-4"><div className="flex flex-wrap items-center gap-2"><time dateTime={item.eventDate} className="text-xs">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.eventDate))}</time><EvidenceStateLabel locale={locale} state={item.state} /></div><p className="mt-3 text-foreground">{copy.complaintSummary[index]}</p><p className="mt-2"><SourceLink locale={locale} href={item.sourceUrl}>{item.id === "guarantee" ? "Ekşi Sözlük" : "Şikayetvar"} · {copy.common.source}</SourceLink></p><div className="mt-4 border border-border p-4"><EvidenceStateLabel locale={locale} state="vendor_claim" /><p className="mt-2">{copy.complaintResponse[index]}</p><SourceLink locale={locale} href={item.responseUrl}>Xpatla · {copy.common.source}</SourceLink></div></article>)}</div> },
    ...page.sections.slice(1).map((section) => ({ title: section.heading, body: <p>{section.body}</p> })),
    { title: copy.common.source, body: <ul className="space-y-3"><li><SourceLink locale={locale} href="https://xpatla.com/legal/terms">Xpatla / Terms</SourceLink></li><li><SourceLink locale={locale} href="https://xpatla.com/platform-integrity">Xpatla / Platform Integrity</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/issues">{copy.common.correctionLink}</SourceLink></li><li><SourceLink locale={locale} href="https://github.com/OnurByte/ISPATLA/commits/main/docs/COMPETITOR_RESEARCH.md">GitHub / {copy.common.checked}</SourceLink></li></ul> },
  ]} />;
}
