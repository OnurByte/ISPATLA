import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";

export default async function LegacyAppRoute({ params, searchParams }: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const localeValue = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const oldPath = slug?.join("/") || "";
  const destination = oldPath === "settings/profile" ? "/profile" : oldPath ? `/${oldPath}` : "/dashboard";
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => queryString.append(key, item));
    else if (value !== undefined) queryString.set(key, value);
  }
  const suffix = queryString.size ? `?${queryString}` : "";
  redirect(`${localizePath(locale, destination)}${suffix}`);
}
