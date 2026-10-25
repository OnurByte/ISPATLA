import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Layers3, Sparkles, Workflow } from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/brand-logo";
import { CampaignPreview } from "@/components/landing/campaign-preview";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { getDictionary } from "@/i18n/dictionaries";
import { localizePath, LOCALE_CONFIG, type Locale } from "@/i18n/config";
import type { CampaignLandingCopy } from "@/i18n/campaign-landing-types";

const workflowIcons = [Workflow, Layers3, Check];
const mcpTools = ["ispatla.opportunities.list", "ispatla.drafts.generate", "ispatla.failures.list"];

export function CampaignLanding({ locale, copy, authenticated }: {
  locale: Locale; copy: CampaignLandingCopy; authenticated: boolean;
}) {
  const path = (href: string) => localizePath(locale, href);
  const startHref = path(authenticated ? "/dashboard" : "/signup");
  const dictionary = getDictionary(locale);
  return <div className="campaign-landing" lang={locale} dir={LOCALE_CONFIG[locale].dir}>
    <header className="campaign-header">
      <div className="campaign-container campaign-header-inner">
        <BrandLogo href={path("/")} ariaLabel="ispatla.tr" className="campaign-logo" />
        <nav className="campaign-nav" aria-label={copy.nav.menu}>
          <a href="#workflow" className="campaign-nav-section">{copy.nav.product}</a>
          <a href="#mcp" className="campaign-nav-section">{copy.nav.mcp}<span className="campaign-nav-dot" aria-hidden="true" /></a>
          <a href="#faq" className="campaign-nav-section">{copy.nav.faq}</a>
          {!authenticated && <Link href={path("/login")} className="campaign-login">{copy.nav.login}</Link>}
          <Link href={startHref} className="campaign-button campaign-button-small">{authenticated ? copy.nav.dashboard : copy.nav.start}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>
    <main>
      <section className="campaign-hero campaign-container" aria-labelledby="campaign-heading">
        <p className="campaign-eyebrow"><span className="campaign-signal" aria-hidden="true" />{copy.eyebrow}</p>
        <h1 id="campaign-heading">{copy.headline}<span>{copy.headlineAccent}</span></h1>
        <p className="campaign-hero-intro">{copy.intro}</p>
        <div className="campaign-actions">
          <Link href={startHref} className="campaign-button">{copy.primaryCta}<ArrowUpRight size={19} aria-hidden="true" /></Link>
          <a href="#workflow" className="campaign-text-button">{copy.secondaryCta}<ArrowDown size={17} aria-hidden="true" /></a>
        </div>
        <p className="campaign-hero-note">{copy.heroNote}</p>
      </section>
      <section className="campaign-container campaign-product" aria-label={copy.preview.title}>
        <div className="campaign-product-frame"><CampaignPreview locale={locale} copy={copy.preview} /></div>
      </section>
      <section className="campaign-container campaign-audience" aria-label={copy.audienceLabel}>
        <p>{copy.audienceLabel}</p>
        <ul>{copy.audiences.map((audience, index) => <li key={audience}><span className="campaign-audience-mark" aria-hidden="true">{["✳", "↗", "◎"][index]}</span>{audience}</li>)}</ul>
      </section>
      <section id="workflow" className="campaign-workflow">
        <div className="campaign-container">
          <div className="campaign-section-heading">
            <div><p className="campaign-eyebrow">{copy.workflow.eyebrow}</p><h2>{copy.workflow.title}</h2></div>
            <p>{copy.workflow.intro}</p>
          </div>
          <ol className="campaign-steps">{copy.workflow.steps.map((step, index) => {
            const Icon = workflowIcons[index];
            return <li key={step.title}><div className="campaign-step-top"><span className="campaign-step-number" aria-hidden="true">0{index + 1}</span><Icon size={25} strokeWidth={1.4} aria-hidden="true" /></div><h3>{step.title}</h3><p>{step.body}</p></li>;
          })}</ol>
        </div>
      </section>
      <section id="mcp" className="campaign-container campaign-mcp">
        <div className="campaign-mcp-copy">
          <p className="campaign-eyebrow"><Sparkles size={16} aria-hidden="true" />{copy.mcp.eyebrow}</p>
          <h2>{copy.mcp.title}</h2><p className="campaign-body">{copy.mcp.intro}</p>
          <ul className="campaign-mcp-benefits">{copy.mcp.steps.map((step) => <li key={step}><Check size={17} aria-hidden="true" />{step}</li>)}</ul>
          <Link href={`${path("/docs")}#mcp`} className="campaign-text-button campaign-link-primary">{copy.mcp.cta}<ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className="campaign-agent-panel">
          <div className="campaign-agent-network" aria-hidden="true">
            <span className="campaign-agent-node"><Sparkles size={25} /><b>AI</b></span>
            <span className="campaign-agent-connection"><span>MCP</span><i /></span>
            <span className="campaign-agent-node campaign-agent-brand"><BrandMark size={40} /><b>ispatla.tr</b></span>
            <span className="campaign-agent-connection"><i /></span>
            <span className="campaign-agent-node"><span className="campaign-x-mark">𝕏</span><Layers3 size={17} /></span>
          </div>
          <div className="campaign-agent-conversation">
            <p className="campaign-agent-prompt">{copy.mcp.prompt}</p>
            <div className="campaign-agent-response"><Sparkles size={19} aria-hidden="true" /><p>{copy.mcp.response}</p></div>
            <ul className="campaign-tool-list">{mcpTools.map((tool, index) => <li key={tool}><span aria-hidden="true">↳</span><code dir="ltr">{tool}</code><span className="campaign-tool-index" aria-hidden="true">0{index + 1}</span></li>)}</ul>
          </div>
          <p className="campaign-agent-caption">{copy.mcp.note}</p>
        </div>
      </section>
      <section id="faq" className="campaign-container campaign-faq">
        <h2>{copy.faqTitle}</h2>
        <div>{copy.faqs.map((item) => <details key={item.question}><summary>{item.question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div>
      </section>
      <section className="campaign-closing"><div className="campaign-container">
        <BrandMark size={52} /><h2>{copy.closing.title}</h2><p>{copy.closing.body}</p>
        <Link href={startHref} className="campaign-button">{copy.closing.cta}<ArrowRight size={19} aria-hidden="true" /></Link>
      </div></section>
    </main>
    <footer className="campaign-footer campaign-container">
      <div className="campaign-footer-top"><div><BrandLogo href={path("/")} ariaLabel="ispatla.tr" className="campaign-logo" /><p>{copy.footerNote}</p></div><LocaleSwitcher locale={locale} /></div>
      <div className="campaign-footer-bottom"><span dir="ltr">© 2026 ispatla.tr</span><nav aria-label={copy.nav.menu}>
        <Link href={path("/docs")}>{dictionary.nav.tour}</Link>
        <Link href={`${path("/docs")}#mcp`}>MCP</Link>
        <a href="https://github.com/OnurByte/ISPATLA" target="_blank" rel="noopener noreferrer" data-landing-event="github_click" data-landing-page="/">GitHub<ArrowUpRight size={13} aria-hidden="true" /></a>
        <Link href={path("/security")}>{dictionary.landing.security}</Link><Link href={path("/privacy")}>{dictionary.landing.privacy}</Link><Link href={path("/terms")}>{dictionary.landing.terms}</Link>
      </nav></div>
    </footer>
  </div>;
}
