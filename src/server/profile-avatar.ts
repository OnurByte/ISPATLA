import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getPostgresProfileAvatarAccess, syncPostgresUserProfileFromX } from "./postgres-public-profile";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
type AvatarMime = keyof typeof MIME_EXTENSIONS;

function avatarRoot(env: Record<string, string | undefined> = process.env, root?: string): string {
  return root || env.ISPATLA_PROFILE_AVATAR_DIR || join(process.cwd(), "state", "profile-avatars");
}

function validAvatarUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.username || url.password || url.port || !url.pathname.startsWith("/profile_images/")) return null;
    return url;
  } catch { return null; }
}

function detectedMime(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function cacheProfileAvatar(input: {
  xUserId: string; avatarUrl: string; fetcher?: typeof fetch; root?: string;
}): Promise<string | null> {
  if (!/^\d+$/.test(input.xUserId) || input.xUserId.length > 32) return null;
  const url = validAvatarUrl(input.avatarUrl);
  if (!url) return null;
  try {
    const response = await (input.fetcher || fetch)(url, { redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const declaredMime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() as AvatarMime | undefined;
    if (!declaredMime || !(declaredMime in MIME_EXTENSIONS)) return null;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_AVATAR_BYTES) return null;
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AVATAR_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (detectedMime(bytes) !== declaredMime) return null;
    const root = avatarRoot(process.env, input.root);
    await mkdir(root, { recursive: true });
    const destination = join(root, `${input.xUserId}.${MIME_EXTENSIONS[declaredMime]}`);
    const temporary = join(root, `.${input.xUserId}.${randomUUID()}.tmp`);
    try { await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 }); await rename(temporary, destination); }
    catch (error) { await rm(temporary, { force: true }); throw error; }
    await Promise.allSettled(Object.values(MIME_EXTENSIONS).filter((extension) => extension !== MIME_EXTENSIONS[declaredMime])
      .map((extension) => rm(join(root, `${input.xUserId}.${extension}`), { force: true })));
    return `/api/profile/avatar/${input.xUserId}`;
  } catch { return null; }
}

export async function cacheSelectedProfileAvatar(input: {
  ownerUserId: string; xUserId: string; handle: string; displayName: string; bio: string; protected?: boolean | null; avatarUrl: string;
  fetcher?: typeof fetch; root?: string;
}): Promise<string | null> {
  if (!await getPostgresProfileAvatarAccess(input.xUserId, input.ownerUserId)) return null;
  const avatarUrl = await cacheProfileAvatar({ xUserId: input.xUserId, avatarUrl: input.avatarUrl, fetcher: input.fetcher, root: input.root });
  if (avatarUrl) {
    try { await syncPostgresUserProfileFromX({ ownerUserId: input.ownerUserId, xUserId: input.xUserId, handle: input.handle, displayName: input.displayName, bio: input.bio, protected: input.protected, avatarUrl }); }
    catch { /* Avatar availability does not affect a successful X connection. */ }
  }
  return avatarUrl;
}

export async function deleteProfileAvatar(xUserId: string, root?: string): Promise<void> {
  if (!/^\d{1,32}$/.test(xUserId)) return;
  const avatarDir = avatarRoot(process.env, root);
  await Promise.all(Object.values(MIME_EXTENSIONS).map((extension) => rm(join(avatarDir, `${xUserId}.${extension}`), { force: true })));
}

export async function profileAvatarFile(xUserId: string, root = avatarRoot()): Promise<{ path: string; mime: AvatarMime } | null> {
  if (!/^\d+$/.test(xUserId) || xUserId.length > 32) return null;
  for (const [mime, extension] of Object.entries(MIME_EXTENSIONS) as [AvatarMime, string][]) {
    const path = join(root, `${xUserId}.${extension}`);
    try { if ((await stat(path)).isFile()) return { path, mime }; } catch { /* Try the other supported raster formats. */ }
  }
  return null;
}
