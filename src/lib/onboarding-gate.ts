import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";

const SETUP_ROUTES = new Set(["/app/onboarding", "/app/accounts", "/app/settings/keys", "/app/settings/appearance"]);

export function getOnboardingRedirect(profileCompleted: boolean, route: string, locale: string) {
  const safeLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  if (route === "/app/onboarding") return null;
  if (!profileCompleted && !SETUP_ROUTES.has(route)) return localizePath(safeLocale, "/app/onboarding");
  return null;
}
