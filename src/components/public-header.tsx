import Link from "next/link";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getOptionalPageUser, hasPageSessionCookie } from "@/server/page-auth";

export async function requestPublicLocale(): Promise<Locale> {
  const locale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

type PublicHeaderProps = { locale: Locale; current?: "docs" | "login" | "signup" | "forgot" | "reset" };

export function PublicHeaderContent({ locale, current, authenticated }: PublicHeaderProps & { authenticated: boolean }) {
  const dictionary = getDictionary(locale);
  const { nav, landing } = dictionary;
  const path = (href: string) => localizePath(locale, href);

  return <header className="border-b border-border bg-background text-foreground">
    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-4 sm:px-8">
      <BrandLogo href={path("/")} ariaLabel={landing.brand} className="shrink-0 [&_.brand-wordmark]:text-lg [&_.brand-gradient-mark]:size-7! sm:[&_.brand-wordmark]:text-[26px] sm:[&_.brand-gradient-mark]:size-11! rounded-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
      <nav aria-label={landing.menuLabel} className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
        <Link href={path("/docs")} aria-current={current === "docs" ? "page" : undefined} className={buttonVariants({ variant: current === "docs" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{nav.tour}</Link>
        {authenticated ? <Link href={path("/dashboard")} className={buttonVariants({ variant: "secondary", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{nav.dashboard}</Link> : <><Link href={path("/login")} aria-current={current === "login" ? "page" : undefined} className={buttonVariants({ variant: current === "login" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-3 sm:text-sm" })}>{nav.login}</Link><Link href={path("/signup")} aria-current={current === "signup" ? "page" : undefined} className={buttonVariants({ className: "h-auto min-h-11 max-w-full whitespace-normal px-2 py-2 text-center text-xs sm:px-4 sm:text-sm" })}>{nav.start}</Link></>}
      </nav>
    </div>
  </header>;
}

export async function PublicHeader({ locale, current, authenticated: authenticatedProp }: PublicHeaderProps & { authenticated?: boolean }) {
  let authenticated = false;
  if (authenticatedProp !== undefined) authenticated = authenticatedProp;
  else try { authenticated = Boolean(await getOptionalPageUser()); }
  catch { authenticated = await hasPageSessionCookie(); }
  return <PublicHeaderContent locale={locale} current={current} authenticated={authenticated} />;
}
