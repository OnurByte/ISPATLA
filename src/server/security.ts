import { timingSafeEqual } from "node:crypto";

const FXTWITTER_HOST = "api.fxtwitter.com";
const MEDIA_HOSTS = {
  photo: "pbs.twimg.com",
  video: "video.twimg.com",
} as const;
const STATUS_HOSTS = new Set(["x.com", "twitter.com"]);

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function isAllowedFxTwitterFeed(value: string): boolean {
  return httpsUrl(value)?.hostname === FXTWITTER_HOST;
}

export function isAllowedMediaUrl(value: string, kind: "photo" | "video"): boolean {
  return httpsUrl(value)?.hostname === MEDIA_HOSTS[kind];
}

export function isAllowedMediaContentType(kind: "photo" | "video", contentType: string): boolean {
  const value = contentType.toLowerCase();
  return kind === "photo" ? value.startsWith("image/") : value.startsWith("video/");
}

export function isAllowedAvatarUrl(value: string): boolean {
  const url = httpsUrl(value);
  return url?.hostname === MEDIA_HOSTS.photo && url.pathname.startsWith("/profile_images/");
}

export function safeStatusUrl(value: string, handle: string, externalId: string): string {
  const safeId = /^\d+$/.test(externalId) ? externalId : "0";
  const fallback = `https://x.com/${encodeURIComponent(handle)}/status/${safeId}`;
  const url = httpsUrl(value);
  if (!url || !STATUS_HOSTS.has(url.hostname) || !/^\/[^/]+\/status\/\d+$/.test(url.pathname)) {
    return fallback;
  }
  return `${url.origin}${url.pathname}`;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Jev scoring endpoints must be plain HTTPS origins with a path only: no embedded
 * credentials, query string or fragment. Plain http is tolerated for loopback
 * development gateways alone.
 */
export function isAllowedJevEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) return false;
  if (url.protocol === "https:") return url.hostname.length > 0;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

function tokenEquals(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export type AdminTokenState = "ok" | "missing" | "invalid";

export function adminTokenState(request: Request): AdminTokenState {
  const expected = process.env.ISPATLA_ADMIN_TOKEN;
  if (!expected) return process.env.NODE_ENV === "production" ? "missing" : "ok";
  const authorization = request.headers.get("authorization") || "";
  const received = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return tokenEquals(expected, received) ? "ok" : "invalid";
}
