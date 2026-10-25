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
  const mcpCopy = locale === "tr"
    ? { title: "MCP bağlantısı (yerel stdio)", body: "MCP istemcinizi kendi ispatla.tr oturumunuza bağlayın. Bu, bilgisayarınızda çalışan yerel bir stdio sürecidir; herkese açık, barındırılan bir MCP hizmeti değildir.", secret: "MCP istemcinizin süreç ortamında ISPATLA_MCP_SESSION_COOKIE değişkenine etkin uygulama oturum çerezinizi verin. Çerezi parola gibi koruyun ve Git'e eklemeyin." }
    : { title: "MCP connection (local stdio)", body: "Connect your MCP client to your own ispatla.tr session. This runs a local stdio process; it is not a hosted public MCP service.", secret: "Set ISPATLA_MCP_SESSION_COOKIE in your MCP client's process environment to your active application session cookie. Treat the cookie like a password and never commit it to Git." };
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
      <PublicSection id="mcp" title={mcpCopy.title}>
        <p>{mcpCopy.body}</p>
        <p>{mcpCopy.secret}</p>
        <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-xs text-foreground">ISPATLA_MCP_SESSION_COOKIE="&lt;your-session-cookie&gt;" bun run mcp</pre>
        <p><a className="underline underline-offset-4" href={`${repo}/blob/main/README.md`} target="_blank" rel="noopener noreferrer">{locale === "tr" ? "MCP kurulum ayrıntıları" : "MCP setup details"}</a></p>
      </PublicSection>
    </div>
    <aside lang={locale} dir={language.dir} className="h-fit space-y-4 rounded-lg border bg-muted/30 p-5 text-sm">
      <p className="font-semibold">{copy.startTitle}</p>
      <Link className="inline-flex min-h-11 items-center underline" href={`${localizePath(locale, "/")}#workflow`}>{copy.explore}</Link>
      <Link className="block min-h-11 py-3 underline" href={localizePath(locale, "/open-source")}>{copy.openSource}</Link>
    </aside>
  </PublicPage>;
}
