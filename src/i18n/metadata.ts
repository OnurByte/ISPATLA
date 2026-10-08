import { LOCALES, type Locale } from "./config";

export function landingAlternates(locale: Locale): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = Object.fromEntries(LOCALES.map((code) => [code, `/${code}`]));
  languages["x-default"] = "/";
  return { canonical: `/${locale}`, languages };
}
