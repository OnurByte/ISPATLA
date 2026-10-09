import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";

export default async function NotFound() {
  const localeValue = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  redirect(localizePath(locale, "/"));
}
