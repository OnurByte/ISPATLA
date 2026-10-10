import Link from "next/link";
import { PublicPage, PublicSection } from "@/components/public-page";
import { requestPublicLocale } from "@/components/public-header";
import { LOCALE_CONFIG, localizePath } from "@/i18n/config";
import { docsCopy } from "@/i18n/docs-copy";
import { publicMetadata } from "@/i18n/public-metadata";

export async function generateMetadata() {
  const locale = await requestPublicLocale();
  const copy = docsCopy[locale];
  return publicMetadata(locale, "/docs", copy.metaTitle, copy.metaDescription);
}

export default async function DocsPage() {
  const locale = await requestPublicLocale();
  const copy = docsCopy[locale];
  const language = LOCALE_CONFIG[locale];
  const repo = "https://github.com/OnurByte/ISPATLA";
  return <PublicPage current="docs" title={copy.title} summary={copy.summary}>
    <div lang={locale} dir={language.dir} className="space-y-10">
      {copy.sections.map(([title, text]) => <PublicSection key={title} title={title}><p>{text}</p></PublicSection>)}
      <PublicSection title={copy.setupTitle}>
        <p>{copy.setupText}</p>
        <ul className="space-y-3">{copy.links.map(([file, label]) => <li key={file}><a className="underline underline-offset-4" href={`${repo}/blob/main/${file}`} target="_blank" rel="noopener noreferrer">{label}</a></li>)}</ul>
        <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">bun install --frozen-lockfile{"\n"}bun run dev</pre>
        <p>{copy.testLimit}</p>
      </PublicSection>
    </div>
    <aside lang={locale} dir={language.dir} className="h-fit space-y-4 rounded-lg border bg-muted/30 p-5 text-sm">
      <p className="font-semibold">{copy.startTitle}</p>
      <Link className="inline-flex min-h-11 items-center underline" href={`${localizePath(locale, "/")}#signal-detector`}>{copy.explore}</Link>
      <Link className="block min-h-11 py-3 underline" href={localizePath(locale, "/open-source")}>{copy.openSource}</Link>
    </aside>
  </PublicPage>;
}
