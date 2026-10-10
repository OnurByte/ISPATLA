import type { MetadataRoute } from "next";
import { PUBLIC_ORIGIN, SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return SIGNAL_PRESS_PATHS.map((path) => ({
    url: `${PUBLIC_ORIGIN}${path}`,
  }));
}
