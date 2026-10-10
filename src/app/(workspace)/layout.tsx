import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getOptionalPageUser } from "@/server/page-auth";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-ispatla-route") === "/onboarding") return children;
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* Protected routes enforce authentication below. */ }
  const requestedLocale = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  return authenticated ? <AppShell locale={locale}>{children}</AppShell> : children;
}
