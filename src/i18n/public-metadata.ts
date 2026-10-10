import type { Metadata } from "next";
import type { Locale } from "./config";

export const PUBLIC_ORIGIN = "https://ispatla.tr";
export const SIGNAL_PRESS_PATHS = ["/", "/docs", "/open-source", "/transparency", "/no-viral-guarantee", "/research/xpatla-consumer-complaints-2026"] as const;

export function publicMetadata(locale: Locale, path: string, title: string, description: string): Metadata {
  const language = locale;
  const url = `${PUBLIC_ORIGIN}${path}`;
  const image = `${PUBLIC_ORIGIN}/api/og?page=${encodeURIComponent(path)}`;
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, siteName: "ISPATLA — The Signal Press", locale: language.replace("-", "_"), type: "website", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
