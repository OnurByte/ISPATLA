import type { Locale } from "./config";

export function landingAlternates(_locale: Locale): { canonical: string } {
  return { canonical: "/" };
}
