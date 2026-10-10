import { headers } from "next/headers";
import Link from "next/link";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";

export default async function NotFound() {
  const localeValue = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  return <main lang={locale} className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="font-mono text-sm">404</p>
    <h1 className="text-3xl font-semibold">{locale === "tr" ? "Sayfa bulunamadı" : "Page not found"}</h1>
    <Link className="underline underline-offset-4" href={localizePath(locale, "/")}>{locale === "tr" ? "Ana sayfaya dön" : "Return to home"}</Link>
  </main>;
}
