import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, localizePath, type Locale } from "./config";

export const PUBLIC_ORIGIN = "https://ispatla.tr";
export const SIGNAL_PRESS_PATHS = ["/", "/docs", "/open-source", "/transparency", "/no-viral-guarantee", "/research/xpatla-consumer-complaints-2026"] as const;

/** Open Graph expects language_TERRITORY tags, not the route locale identifiers. */
export const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US", "zh-CN": "zh_CN", hi: "hi_IN", es: "es_ES", fr: "fr_FR",
  ar: "ar_SA", bn: "bn_BD", "pt-BR": "pt_BR", ru: "ru_RU", id: "id_ID",
  ur: "ur_PK", de: "de_DE", ja: "ja_JP", sw: "sw_TZ", mr: "mr_IN",
  te: "te_IN", tr: "tr_TR", ta: "ta_IN", vi: "vi_VN", ko: "ko_KR",
};

/** Keep the site's chosen separator consistent across title and social metadata. */
export function normalizeMetadataText(value: string): string {
  return value.replace(/[·—–]/gu, " ⁜ ").replace(/\s+/gu, " ").trim();
}

export function publicMetadata(locale: Locale, path: string, title: string, description: string): Metadata {
  const url = `${PUBLIC_ORIGIN}${localizePath(locale, path)}`;
  const image = `${PUBLIC_ORIGIN}/api/og?locale=${encodeURIComponent(locale)}&page=${encodeURIComponent(path)}`;
  const metadataTitle = normalizeMetadataText(title);
  const metadataDescription = normalizeMetadataText(description);
  const imageAlt = metadataTitle;
  const oEmbedUrl = (SIGNAL_PRESS_PATHS as readonly string[]).includes(path)
    ? `${PUBLIC_ORIGIN}/oembed.json?${new URLSearchParams({ url, format: "json" })}`
    : undefined;
  return {
    title: metadataTitle,
    description: metadataDescription,
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(LOCALES.map((code) => [code, `${PUBLIC_ORIGIN}${localizePath(code, path)}`])), "x-default": `${PUBLIC_ORIGIN}${localizePath(DEFAULT_LOCALE, path)}` },
      ...(oEmbedUrl ? { types: { "application/json+oembed": oEmbedUrl } } : {}),
    },
    robots: { index: true, follow: true },
    openGraph: {
      title: metadataTitle,
      description: metadataDescription,
      url,
      siteName: "İSPATLA",
      locale: OPEN_GRAPH_LOCALES[locale],
      alternateLocale: LOCALES.filter((code) => code !== locale).map((code) => OPEN_GRAPH_LOCALES[code]),
      type: "website",
      images: [{ url: image, secureUrl: image, type: "image/png", width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: metadataTitle,
      description: metadataDescription,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}
