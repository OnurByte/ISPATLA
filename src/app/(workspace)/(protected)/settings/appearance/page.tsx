import { headers } from "next/headers";
import { AppearanceSettings } from "@/components/appearance-settings";
import { PageHeading } from "@/components/page-heading";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { requirePageUser } from "@/server/page-auth";
import { getUiText } from "@/i18n/ui";

export default async function AppearanceSettingsPage() {
  await requirePageUser();
  const requestedLocale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const t = (message: string) => getUiText(locale, message);
  return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10">
    <PageHeading eyebrow={t("Settings / appearance")} title={t("Appearance preferences")} description={t("Choose your interface language, theme, and motion preference.")} />
    <AppearanceSettings locale={locale} />
  </div></main>;
}
