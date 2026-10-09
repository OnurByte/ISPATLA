import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN, SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";
import { LOCALES, localizePath } from "@/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return SIGNAL_PRESS_PATHS.flatMap((path) => LOCALES.map((locale) => ({
    url: `${PUBLIC_ORIGIN}${localizePath(locale, path)}`,
    alternates: { languages: Object.fromEntries(LOCALES.map((code) => [code, `${PUBLIC_ORIGIN}${localizePath(code, path)}`])) },
  })));
}
