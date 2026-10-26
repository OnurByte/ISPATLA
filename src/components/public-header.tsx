import { PublicHeaderContent, type PublicHeaderProps } from "./public-header-content";
export { PublicHeaderContent } from "./public-header-content";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { getOptionalPageUser, hasPageSessionCookie } from "@/server/page-auth";

export async function requestPublicLocale(): Promise<Locale> {
  const locale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}


export async function PublicHeader({ locale, current, authenticated: authenticatedProp }: PublicHeaderProps & { authenticated?: boolean }) {
  let authenticated = false;
  if (authenticatedProp !== undefined) authenticated = authenticatedProp;
  else try { authenticated = Boolean(await getOptionalPageUser()); }
  catch { authenticated = await hasPageSessionCookie(); }
  return <PublicHeaderContent locale={locale} current={current} authenticated={authenticated} />;
}
