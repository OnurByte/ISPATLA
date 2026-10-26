import { headers } from "next/headers";
import { AppearanceSettings } from "@/components/appearance-settings";
import { PageHeading } from "@/components/page-heading";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { requirePageUser } from "@/server/page-auth";

export default async function AppearanceSettingsPage() {
  await requirePageUser();
  const requestedLocale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  return <main className="min-h-screen"><div className="site-container site-container--reading flex flex-col gap-7 py-6 lg:py-10">
    <PageHeading eyebrow="Ayarlar / görünüm" title="Sana uygun görünüm" description="Arayüz dilini, temayı ve hareket tercihini seç." />
    <AppearanceSettings locale={locale} />
  </div></main>;
}
