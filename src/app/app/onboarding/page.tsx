import { headers } from "next/headers";
import { OnboardingProfile } from "@/components/onboarding-profile";
import { getOwnUserProfile } from "@/server/db";
import { renderUserPage } from "@/server/page-auth";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const localeValue = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  return renderUserPage(() => <OnboardingProfile initial={getOwnUserProfile()} locale={locale} />);
}
