import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/** OG images render in request locale; no-request unit tests render deterministically in default locale. */
export async function requestOpenGraphLocale(): Promise<Locale> {
  try {
    const requested = (await headers()).get("x-ispatla-locale");
    return requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside a request scope")) return DEFAULT_LOCALE;
    throw error;
  }
}
