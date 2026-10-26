import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { getDictionary } from "@/i18n/dictionaries";
import { localizePath, type Locale } from "@/i18n/config";
import { publicUiCopy } from "@/i18n/public-ui-copy";
import "@/styles/public-footer.css";

export function PublicFooter({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const path = (href: string) => localizePath(locale, href);
  return (
    <footer className="public-footer"><div className="campaign-footer site-container">
      <div className="campaign-footer-top"><div><BrandLogo href={path("/")} ariaLabel="ispatla.tr" className="campaign-logo" /></div><LocaleSwitcher locale={locale} className="min-h-11 items-center sm:min-h-12" /></div>
      <div className="campaign-footer-bottom"><span dir="ltr">© 2026 ispatla.tr</span><nav aria-label={dictionary.landing.menuLabel}>
        <Link href={path("/docs")}>{publicUiCopy[locale].docs}</Link>
        <Link href={`${path("/docs")}#mcp`}>MCP</Link>
        <a href="https://github.com/OnurByte/ISPATLA" target="_blank" rel="noopener noreferrer" data-landing-event="github_click" data-landing-page="/">GitHub<ArrowUpRight size={13} aria-hidden="true" /></a>
        <a href="https://x.com/ispatlatr" target="_blank" rel="noopener noreferrer" aria-label="ispatla.tr ⁜ 𝕏">𝕏</a>
        <Link href={path("/security")}>{dictionary.landing.security}</Link><Link href={path("/privacy")}>{dictionary.landing.privacy}</Link><Link href={path("/terms")}>{dictionary.landing.terms}</Link>
      </nav></div>
    </div></footer>
  );
}
