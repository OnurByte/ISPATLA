import { getCampaignLandingCopy } from "@/i18n/campaign-landing";
import { LOCALES, localizePath, type Locale } from "@/i18n/config";
import { docsCopy } from "@/i18n/docs-copy";
import { publicEvidencePageCopy } from "@/i18n/public-evidence-copy";
import { PUBLIC_ORIGIN, publicMetadata, SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";

type PublicPath = (typeof SIGNAL_PRESS_PATHS)[number];
type PublicTarget = { locale: Locale; path: PublicPath };

const supportedTargets = new Map<string, PublicTarget>();
for (const path of SIGNAL_PRESS_PATHS) {
  for (const locale of LOCALES) {
    supportedTargets.set(`${PUBLIC_ORIGIN}${localizePath(locale, path)}`, { locale, path });
  }
}

const responseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Robots-Tag": "noindex, follow",
};

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...responseHeaders, "Cache-Control": "no-store" },
  });
}

function pageCopy(locale: Locale, path: PublicPath): { title: string; description: string } {
  if (path === "/") {
    const copy = getCampaignLandingCopy(locale);
    return {
      title: `${copy.headline} ${copy.headlineAccent} ⁜ ispatla.tr`,
      description: copy.intro,
    };
  }
  if (path === "/docs") {
    const copy = docsCopy[locale];
    return { title: copy.metaTitle, description: copy.metaDescription };
  }
  return publicEvidencePageCopy(locale, path);
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const formats = params.getAll("format");
  if (formats.length > 1 || (formats.length === 1 && formats[0] !== "json")) {
    return errorResponse(501, "Only JSON oEmbed responses are supported.");
  }

  const values = params.getAll("url");
  if (values.length !== 1 || !values[0]) return errorResponse(400, "A canonical page URL is required.");

  let target: URL;
  try {
    target = new URL(values[0]);
  } catch {
    return errorResponse(400, "The page URL is malformed.");
  }

  if (target.origin !== PUBLIC_ORIGIN || target.username || target.password || target.search || target.hash) {
    return errorResponse(404, "The page URL is not supported.");
  }
  const publicTarget = supportedTargets.get(target.href);
  if (!publicTarget) return errorResponse(404, "The page URL is not supported.");

  const { locale, path } = publicTarget;
  const copy = pageCopy(locale, path);
  const metadata = publicMetadata(locale, path, copy.title, copy.description);
  if (typeof metadata.title !== "string" || !metadata.description) {
    return errorResponse(500, "Page metadata is unavailable.");
  }

  const thumbnailUrl = `${PUBLIC_ORIGIN}/api/og?${new URLSearchParams({ locale, page: path })}`;
  return new Response(JSON.stringify({
    version: "1.0",
    type: "link",
    provider_name: "ispatla.tr",
    provider_url: PUBLIC_ORIGIN,
    author_name: "ispatla.tr",
    author_url: PUBLIC_ORIGIN,
    title: metadata.title,
    description: metadata.description,
    thumbnail_url: thumbnailUrl,
    thumbnail_width: 1200,
    thumbnail_height: 630,
  }), {
    status: 200,
    headers: { ...responseHeaders, "Cache-Control": "public, max-age=300" },
  });
}
