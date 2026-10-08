import Link from "next/link";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/brand-logo";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { LocaleSwitcher } from "@/i18n/locale-switcher";

export async function requestPublicLocale(): Promise<Locale> {
  const locale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function PublicHeader({ locale, current }: { locale: Locale; current?: "docs" | "login" | "signup" | "forgot" | "reset" }) {
  const dictionary = getDictionary(locale);
  const { nav, landing } = dictionary;
  const path = (href: string) => localizePath(locale, href);
  return <header className="border-b bg-background text-foreground">
    <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-8">
      <Link href={path("/")} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label="ispatla.tr"><BrandLogo /></Link>
      <div className="flex shrink-0 items-center gap-2 md:order-3"><ModeToggle /><LocaleSwitcher locale={locale} /></div>
      <nav aria-label={landing.menuLabel} className="flex w-full flex-wrap items-center gap-2 md:order-2 md:ms-auto md:w-auto">
        <Link href={path("/docs")} aria-current={current === "docs" ? "page" : undefined} className={buttonVariants({ variant: current === "docs" ? "secondary" : "ghost", className: "h-auto min-h-10 max-w-full whitespace-normal px-3 py-2 text-center" })}>{nav.tour}</Link>
        <Link href={path("/login")} aria-current={current === "login" ? "page" : undefined} className={buttonVariants({ variant: current === "login" ? "secondary" : "ghost", className: "h-auto min-h-10 max-w-full whitespace-normal px-3 py-2 text-center" })}>{nav.login}</Link>
        <Link href={path("/signup")} aria-current={current === "signup" ? "page" : undefined} className={buttonVariants({ className: "h-auto min-h-10 max-w-full whitespace-normal px-4 py-2 text-center" })}>{nav.start}</Link>
      </nav>
    </div>
  </header>;
}
