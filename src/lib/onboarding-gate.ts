import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";

const SETUP_ROUTES = new Set(["/onboarding", "/accounts", "/settings/keys", "/settings/appearance"]);

export function getOnboardingRedirect(profileCompleted: boolean, route: string, locale: string) {
  const safeLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  if (route === "/onboarding") return null;
  if (!profileCompleted && !SETUP_ROUTES.has(route)) return localizePath(safeLocale, "/onboarding");
  return null;
}
