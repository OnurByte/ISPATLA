/**
 * A single, existing branded PNG is the browser/app icon source.
 * Keep this file in sync with public/brand/ispatla-favicon.png.
 * An explicit revision changes the URL when browser caches retain old icons.
 */
export const SITE_FAVICON_PATH = "/brand/ispatla-favicon.png";
export const SITE_FAVICON_URL = SITE_FAVICON_PATH + "?v=20261011";

export const SITE_ICON_METADATA = {
  icon: [{ url: SITE_FAVICON_URL, type: "image/png" }],
  shortcut: [{ url: SITE_FAVICON_URL, type: "image/png" }],
  apple: [{ url: SITE_FAVICON_URL, type: "image/png" }],
};
