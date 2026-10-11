import Link from "next/link";
import { headers } from "next/headers";
import { PublicHeaderNav } from "@/components/public-header-nav";
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
    <PublicHeaderNav label={landing.menuLabel} brand={<BrandLogo href={path("/")} ariaLabel={landing.brand} className="w-fit rounded-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />}>
        <Link href={path("/docs")} aria-current={current === "docs" ? "page" : undefined} className={buttonVariants({ variant: current === "docs" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-3 py-2 text-center" })}>{nav.tour}</Link>
        {authenticated ? <Link href={path("/dashboard")} className={buttonVariants({ variant: "secondary", className: "h-auto min-h-11 max-w-full whitespace-normal px-3 py-2 text-center" })}>{nav.dashboard}</Link> : <><Link href={path("/login")} aria-current={current === "login" ? "page" : undefined} className={buttonVariants({ variant: current === "login" ? "secondary" : "ghost", className: "h-auto min-h-11 max-w-full whitespace-normal px-3 py-2 text-center" })}>{nav.login}</Link><Link href={path("/signup")} aria-current={current === "signup" ? "page" : undefined} className={buttonVariants({ className: "h-auto min-h-11 max-w-full whitespace-normal px-4 py-2 text-center" })}>{nav.start}</Link></>}
    </PublicHeaderNav>
  </header>;
}

export async function PublicHeader({ locale, current, authenticated: authenticatedProp }: PublicHeaderProps & { authenticated?: boolean }) {
  let authenticated = false;
  if (authenticatedProp !== undefined) authenticated = authenticatedProp;
  else try { authenticated = Boolean(await getOptionalPageUser()); }
  catch { authenticated = await hasPageSessionCookie(); }
  return <PublicHeaderContent locale={locale} current={current} authenticated={authenticated} />;
}
