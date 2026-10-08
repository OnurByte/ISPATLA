export const LOCALES = ["en", "zh-CN", "hi", "es", "fr", "ar", "bn", "pt-BR", "ru", "id", "ur", "de", "ja", "sw", "mr", "te", "tr", "ta", "vi", "ko"] as const;
export const DEFAULT_LOCALE = "tr" as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_CONFIG: Record<Locale, { label: string; nativeName: string; flag: string; dir: "ltr" | "rtl" }> = {
  en: { label: "English", nativeName: "English", flag: "🇬🇧", dir: "ltr" },
  "zh-CN": { label: "Chinese (Simplified)", nativeName: "简体中文", flag: "🇨🇳", dir: "ltr" },
  hi: { label: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
  es: { label: "Spanish", nativeName: "Español", flag: "🇪🇸", dir: "ltr" },
  fr: { label: "French", nativeName: "Français", flag: "🇫🇷", dir: "ltr" },
  ar: { label: "Arabic", nativeName: "العربية", flag: "🇸🇦", dir: "rtl" },
  bn: { label: "Bengali", nativeName: "বাংলা", flag: "🇧🇩", dir: "ltr" },
  "pt-BR": { label: "Portuguese (Brazil)", nativeName: "Português (Brasil)", flag: "🇧🇷", dir: "ltr" },
  ru: { label: "Russian", nativeName: "Русский", flag: "🇷🇺", dir: "ltr" },
  id: { label: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩", dir: "ltr" },
  ur: { label: "Urdu", nativeName: "اردو", flag: "🇵🇰", dir: "rtl" },
  de: { label: "German", nativeName: "Deutsch", flag: "🇩🇪", dir: "ltr" },
  ja: { label: "Japanese", nativeName: "日本語", flag: "🇯🇵", dir: "ltr" },
  sw: { label: "Swahili", nativeName: "Kiswahili", flag: "🇹🇿", dir: "ltr" },
  mr: { label: "Marathi", nativeName: "मराठी", flag: "🇮🇳", dir: "ltr" },
  te: { label: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳", dir: "ltr" },
  tr: { label: "Turkish", nativeName: "Türkçe", flag: "🇹🇷", dir: "ltr" },
  ta: { label: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳", dir: "ltr" },
  vi: { label: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳", dir: "ltr" },
  ko: { label: "Korean", nativeName: "한국어", flag: "🇰🇷", dir: "ltr" },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1] || "";
  return isLocale(first) ? first : null;
}

export function stripLocalePrefix(pathname: string): string {
  const locale = localeFromPath(pathname);
  if (!locale) return pathname || "/";
  const stripped = pathname.slice(locale.length + 1).replace(/^\/+/, "");
  return stripped ? `/${stripped}` : "/";
}

export function localizePath(locale: Locale, pathname: string): string {
  return `/${locale}${stripLocalePrefix(pathname) === "/" ? "" : stripLocalePrefix(pathname)}`;
}
