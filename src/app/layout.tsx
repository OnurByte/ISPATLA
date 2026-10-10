import type { Metadata } from "next";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthSessionSync } from "@/components/auth-session-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_LOCALE, isLocale, LOCALE_CONFIG } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_ORIGIN),
  title: "Ispatla — 𝕏 intelligence desk",
  description: "Track 𝕏 signals, make evidence-based publishing decisions, and verify the results.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/ispatla-favicon.png" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const requestedLocale = requestHeaders.get("x-ispatla-locale") || DEFAULT_LOCALE;
  const locale = isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const direction = LOCALE_CONFIG[locale].dir;
  const dictionary = getDictionary(locale);
  const notice = requestHeaders.get("x-ispatla-route") === "/" ? dictionary.landing.partialNotice : dictionary.status.partial;
  return (
    <html lang={locale} dir={direction} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider>
            <AuthSessionSync />
            {locale !== DEFAULT_LOCALE && notice && <aside className="border-b bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground" lang={locale} dir={direction}>{notice}</aside>}
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
