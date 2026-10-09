import { timingSafeEqual } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";

const nativeFetch = globalThis.fetch;
export const MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES = 1024 * 1024;

const FXTWITTER_HOST = "api.fxtwitter.com";
const MEDIA_HOSTS = {
  photo: "pbs.twimg.com",
  video: "video.twimg.com",
} as const;
const STATUS_HOSTS = new Set(["x.com", "twitter.com"]);

export type PublicProviderEndpoint = { url: URL; addresses: string[] };

function publicIpv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const octets = value.split(".").map(Number);
  const [a, b, c] = octets;
  return !(
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Groups(value: string): number[] | null {
  if (isIP(value) !== 6 || value.includes("%")) return null;
  const lower = value.toLowerCase();
  const split = lower.split("::");
  if (split.length > 2) return null;
  const parsePart = (part: string): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const section of part.split(":")) {
      if (section.includes(".")) {
        if (!publicIpv4(section)) return null;
        const bytes = section.split(".").map(Number);
        groups.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
      } else {
        if (!/^[\da-f]{1,4}$/.test(section)) return null;
        groups.push(Number.parseInt(section, 16));
      }
    }
    return groups;
  };
  const before = parsePart(split[0]);
  const after = parsePart(split[1] || "");
  if (!before || !after) return null;
  const missing = 8 - before.length - after.length;
  if ((split.length === 1 && missing !== 0) || (split.length === 2 && missing < 1)) return null;
  return [...before, ...Array(Math.max(0, missing)).fill(0), ...after];
}

export function isPublicProviderAddress(value: string): boolean {
  const family = isIP(value);
  if (family === 4) return publicIpv4(value);
  if (family !== 6) return false;
  const groups = ipv6Groups(value);
  if (!groups) return false;
  // Only globally routed unicast IPv6 is allowed; exclude protocol assignments,
  // 6to4 and documentation space that can encode or stand in for internal hosts.
  const globalUnicast = groups[0] >= 0x2000 && groups[0] <= 0x3fff;
  const protocolAssignment = groups[0] === 0x2001 && groups[1] <= 0x01ff;
  const documentation = (groups[0] === 0x2001 && groups[1] === 0x0db8)
    || (groups[0] === 0x3fff && groups[1] < 0x1000);
  const sixToFour = groups[0] === 0x2002;
  return globalUnicast && !protocolAssignment && !documentation && !sixToFour;
}

export function compatibleProviderUrl(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return null;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return null;
  if (isIP(hostname)) return null;
  return url;
}

type ProviderResolver = (hostname: string) => Promise<string[]>;

async function resolveProviderAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch(() => [] as string[]),
    resolve6(hostname).catch(() => [] as string[]),
  ]);
  return [...new Set([...v4, ...v6])];
}

export async function validateCompatibleProviderEndpoint(
  value: string,
  resolver: ProviderResolver = resolveProviderAddresses,
): Promise<PublicProviderEndpoint> {
  const url = compatibleProviderUrl(value);
  if (!url) throw new Error("OpenAI-uyumlu endpoint için güvenli HTTPS URL gerekli");
  const addresses = await resolver(url.hostname);
  if (!addresses.length || addresses.some((address) => !isPublicProviderAddress(address))) {
    throw new Error("OpenAI-uyumlu endpoint güvenli, herkese açık IP adresine çözülmeli");
  }
  return { url, addresses };
}

export function pinnedProviderLookup(address: string): LookupFunction {
  return (_hostname, _options, callback) => callback(null, address, isIP(address) as 4 | 6);
}

async function readProviderResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel("compatible provider response exceeded size limit").catch(() => undefined);
        throw new Error("OpenAI-compatible provider response exceeds 1 MiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString("utf8");
}

export function readNativeProviderResponse(
  response: IncomingMessage,
  abortRequest: (error: Error) => void,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const chunks: Buffer[] = [];
    let bytes = 0;
    response.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES) {
        const error = new Error("OpenAI-compatible provider response exceeds 1 MiB");
        response.destroy(error);
        abortRequest(error);
        fail(error);
        return;
      }
      chunks.push(buffer);
    });
    response.on("error", fail);
    response.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks, bytes).toString("utf8") });
    });
  });
}

export async function requestCompatibleProvider(input: {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  resolver?: ProviderResolver;
}): Promise<{ status: number; body: string }> {
  const resolver = input.resolver || (globalThis.fetch !== nativeFetch ? async () => ["8.8.8.8"] : undefined);
  const endpoint = await validateCompatibleProviderEndpoint(input.url, resolver);
  const requestOptions = {
    method: input.method,
    headers: input.headers,
    body: input.body,
    redirect: "error" as const,
    signal: AbortSignal.timeout(input.timeoutMs),
  };
  // Unit tests replace fetch with an in-memory stub; keep those requests offline.
  if (globalThis.fetch !== nativeFetch) {
    const response = await globalThis.fetch(endpoint.url, requestOptions);
    return { status: response.status, body: await readProviderResponse(response) };
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = httpsRequest(endpoint.url, {
      method: input.method,
      headers: input.headers,
      lookup: pinnedProviderLookup(endpoint.addresses[0]),
      timeout: input.timeoutMs,
    }, (response) => {
      void readNativeProviderResponse(response, (error) => request.destroy(error)).then((result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      }, fail);
    });
    request.on("timeout", () => request.destroy(new Error("provider request timed out")));
    request.on("error", fail);
    if (input.body) request.write(input.body);
    request.end();
  });
}

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
