import Link from "next/link";
import { publicUiCopy } from "@/i18n/public-ui-copy";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export type PublicHeaderProps = { locale: Locale; current?: "docs" | "login" | "signup" | "forgot" | "reset" };

export function PublicHeaderContent({ locale, current, authenticated, leading }: PublicHeaderProps & { authenticated: boolean; leading?: ReactNode }) {
  const dictionary = getDictionary(locale);
  const { nav, landing } = dictionary;
  const path = (href: string) => localizePath(locale, href);

  return <header className="border-b border-border bg-background text-foreground">
    <div className="site-container flex items-center justify-between flex-wrap gap-x-6 gap-y-3 py-4">
      <div className="flex min-w-0 items-center gap-2">{leading}<BrandLogo href={path("/")} ariaLabel={landing.brand} className="shrink-0 rounded-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" /></div>
      <nav aria-label={landing.menuLabel} className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
        <Link href={path("/docs")} aria-current={current === "docs" ? "page" : undefined} className={buttonVariants({ variant: current === "docs" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{publicUiCopy[locale].docs}</Link>
        {authenticated ? <Link href={path("/dashboard")} className={buttonVariants({ variant: "secondary", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{nav.dashboard}</Link> : <><Link href={path("/login")} aria-current={current === "login" ? "page" : undefined} className={buttonVariants({ variant: current === "login" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{nav.login}</Link><Link href={path("/signup")} aria-current={current === "signup" ? "page" : undefined} className={buttonVariants({ className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-4 sm:text-sm" })}>{nav.start}</Link></>}
      </nav>
    </div>
  </header>;
}

