import Link from "next/link";
import { BrandText } from "@/components/brand-text";
import { getDictionary } from "@/i18n/dictionaries";
import { publicUiCopy } from "@/i18n/public-ui-copy";
import { PublicPage, PublicSection } from "@/components/public-page";
import { requestPublicLocale } from "@/components/public-header";
import { LOCALE_CONFIG, localizePath } from "@/i18n/config";
import { docsCopy } from "@/i18n/docs-copy";
import { mcpEvidenceCopy, mcpHelpCopy } from "@/i18n/mcp-help-copy";
import { publicMetadata, PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export async function generateMetadata() {
  const locale = await requestPublicLocale();
  const copy = docsCopy[locale];
  return publicMetadata(locale, "/docs", copy.metaTitle, copy.metaDescription);
}

export default async function DocsPage() {
  const locale = await requestPublicLocale();
  const copy = docsCopy[locale];
  const language = LOCALE_CONFIG[locale];
  const mcpCopy = mcpHelpCopy[locale];
  const mcpEvidence = mcpEvidenceCopy[locale];
  const repo = "https://github.com/OnurByte/ISPATLA";
  const anchors = ["opportunity", "account", "drafts"];
  return <PublicPage current="docs" title={publicUiCopy[locale].docs} summary={copy.summary}>
    <div lang={locale} dir={language.dir} className="space-y-12 docs-content">
      {copy.sections.map(([title, text], index) => <PublicSection id={anchors[index]} key={title} title={title}><p><BrandText text={text} /></p></PublicSection>)}
      <PublicSection id="setup" title={copy.setupTitle}>
        <p><BrandText text={copy.setupText} /></p>
        <ul className="space-y-3">{copy.links.map(([file, label]) => <li key={file}><a className="underline underline-offset-4" href={`${repo}/blob/main/${file}`} target="_blank" rel="noopener noreferrer">{label}</a></li>)}</ul>
        <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">bun install --frozen-lockfile{"\n"}bun run dev</pre>
        <p><BrandText text={copy.testLimit} /></p>
      </PublicSection>
      <PublicSection id="mcp" title={mcpCopy.title}>
        <p><BrandText text={mcpCopy.intro} /></p>
        <h3 className="text-base font-semibold">{mcpCopy.localTitle}</h3>
        <p><BrandText text={mcpCopy.localBody} /></p>
        <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">{'{"mcpServers":{"ispatla":{"command":"bun","args":["run","mcp"],"env":{"ISPATLA_MCP_SESSION_COOKIE":"<session-cookie>"}}}'}</pre>
        <p><BrandText text={mcpCopy.secret} /></p>
        <h3 className="text-base font-semibold">{mcpCopy.remoteTitle}</h3>
        <p><BrandText text={mcpCopy.remoteBody} /></p>
        <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">{`${PUBLIC_ORIGIN}/mcp\n${PUBLIC_ORIGIN}/.well-known/oauth-authorization-server`}</pre>
        <h3 className="text-base font-semibold">{mcpCopy.scopesTitle}</h3>
        <p><BrandText text={mcpCopy.scopesBody.replace(/\bSecurity\b/g, getDictionary(locale).landing.security)} /></p>
        <h3 className="text-base font-semibold">{mcpCopy.limitsTitle}</h3>
        <p><BrandText text={mcpCopy.limitsBody} /></p>
        <h3 className="text-base font-semibold">{mcpEvidence.title}</h3>
        <p><BrandText text={mcpEvidence.body} /></p>
      </PublicSection>
    </div>
    <aside lang={locale} dir={language.dir} className="docs-contents h-fit space-y-4 rounded-xl border bg-muted/30 p-5 text-sm lg:sticky lg:top-6">
      <p className="font-semibold">{publicUiCopy[locale].docs}</p>
      <nav className="grid gap-1" aria-label={publicUiCopy[locale].docs}>
        {copy.sections.map(([title], index) => <Link className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" key={anchors[index]} href={`#${anchors[index]}`}>{title}</Link>)}
        <Link className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-accent" href="#setup">{copy.setupTitle}</Link>
        <Link className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-accent" href="#mcp">{mcpCopy.title}</Link>
      </nav>
      <Link className="inline-flex min-h-11 items-center underline" href={`${localizePath(locale, "/")}#campaign-opportunity`}>{copy.explore}</Link>
      <Link className="block min-h-11 py-3 underline" href={localizePath(locale, "/open-source")}>{copy.openSource}</Link>
    </aside>
  </PublicPage>;
}
