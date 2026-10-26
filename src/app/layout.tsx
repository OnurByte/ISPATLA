import { getUiMessages, getUiAliases } from "@/i18n/ui";
import { UiLocaleProvider } from "@/i18n/ui-client";
import type { Metadata } from "next";
import { preload } from "react-dom";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthSessionSync } from "@/components/auth-session-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_LOCALE, isLocale, LOCALE_CONFIG } from "@/i18n/config";
import { getAuth, isAuthenticatedUserDisabled } from "@/server/auth";
import { rootMetadata } from "@/i18n/metadata";
import "./globals.css";

export async function generateMetadata():Promise<Metadata> {
  const requestedLocale=(await headers()).get("x-ispatla-locale")||DEFAULT_LOCALE;
  return rootMetadata(isLocale(requestedLocale)?requestedLocale:DEFAULT_LOCALE);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload("/fonts/libron-regular.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/fonts/libron-bold.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const requestHeaders = await headers();
  const requestedLocale = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const direction = LOCALE_CONFIG[locale].dir;
  let forceSystemTheme = false;
  if (requestHeaders.get("x-ispatla-route") === "/") {
    try {
      const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
      forceSystemTheme = !session || await isAuthenticatedUserDisabled(session.user.id);
    } catch { forceSystemTheme = true; }
  }
  return (
    <html lang={locale} dir={direction} data-scroll-behavior="smooth" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <UiLocaleProvider locale={locale} messages={getUiMessages(locale)} aliases={getUiAliases()}><ThemeProvider forceSystemTheme={forceSystemTheme}>
          <TooltipProvider>
            <AuthSessionSync />
            {children}
          </TooltipProvider>
        </ThemeProvider></UiLocaleProvider>
      </body>
    </html>
  );
}
