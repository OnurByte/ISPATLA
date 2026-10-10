import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

/** Only public, site-relative URLs may be shared. */
export function publicShareUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) {
    throw new Error("Expected a site-relative public URL");
  }
  const url = new URL(path, PUBLIC_ORIGIN);
  if (url.origin !== PUBLIC_ORIGIN) throw new Error("Cross-origin social URL");
  return url.toString();
}

export function publicSocialImageUrl(path: string): string {
  const url = new URL(publicShareUrl(path));
  if (url.search || url.hash) throw new Error("An OG image path cannot have search or hash");
  return publicShareUrl(url.pathname.replace(/\/+$/, "") + "/opengraph-image");
}

export function socialShareTargets(url: string, text: string) {
  const address = encodeURIComponent(url);
  const title = encodeURIComponent(text);
  return [
    { label: "X", href: "https://twitter.com/intent/tweet?text=" + title + "&url=" + address },
    { label: "WhatsApp", href: "https://wa.me/?text=" + encodeURIComponent(text + " " + url) },
    { label: "Telegram", href: "https://t.me/share/url?url=" + address + "&text=" + title },
    { label: "Facebook", href: "https://www.facebook.com/sharer/sharer.php?u=" + address },
  ] as const;
}

/** null means the X API did not provide a value; it does not mean zero. */
export function compactOfficialMetric(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
