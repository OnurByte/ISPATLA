/**
 * A single, existing branded PNG is the browser/app icon source.
 * Keep this file in sync with public/brand/ispatla-favicon.png.
 * Keep a stable crawlable URL across themes, accents and client navigation.
 */
export const SITE_FAVICON_PATH = "/brand/ispatla-favicon.png";
export const SITE_FAVICON_URL = SITE_FAVICON_PATH;

export const SITE_ICON_METADATA = {
  icon: [{ url: SITE_FAVICON_URL, type: "image/png", sizes: "180x180" }],
  shortcut: [{ url: SITE_FAVICON_URL, type: "image/png", sizes: "180x180" }],
  apple: [{ url: SITE_FAVICON_URL, type: "image/png", sizes: "180x180" }],
};
