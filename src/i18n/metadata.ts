import type {Metadata} from "next";
import {getDictionary} from "./dictionaries";
import {PUBLIC_ORIGIN} from "./public-metadata";
import {SITE_ICON_METADATA} from "@/lib/site-icons";
import { LOCALES, localizePath, type Locale } from "./config";

export function landingAlternates(locale: Locale): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = Object.fromEntries(LOCALES.map((code) => [code, localizePath(code, "/")]));
  languages["x-default"] = "/";
  return { canonical: localizePath(locale, "/"), languages };
}

/** Public pages can override this; private/auth pages inherit localized shell metadata. */
export function rootMetadata(locale:Locale):Metadata{
 const {nav}=getDictionary(locale);
 return {metadataBase:new URL(PUBLIC_ORIGIN),title:`ispatla.tr ⁜ ${nav.primary}`,description:nav.shellDescription,icons:SITE_ICON_METADATA};
}
