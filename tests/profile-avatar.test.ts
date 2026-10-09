import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheProfileAvatar, profileAvatarFile } from "../src/server/profile-avatar";

const root = mkdtempSync(join(tmpdir(), "ispatla-profile-avatar-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
const fetchBytes = (bytes: Uint8Array, headers = { "content-type": "image/png" }) => (async (_url: RequestInfo | URL, init?: RequestInit) => {
  expect(init?.redirect).toBe("error");
  return new Response(Buffer.from(bytes), { headers });
}) as typeof fetch;

test("caches only bounded raster avatar bytes from the X image host and keeps a prior file on failure", async () => {
  let called = false;
  const unsafe = await cacheProfileAvatar({ xUserId: "123", avatarUrl: "https://evil.example/profile_images/a.png", root, fetcher: (async () => { called = true; return Response.error(); }) as unknown as typeof fetch });
  expect(unsafe).toBeNull();
  expect(called).toBe(false);
  expect(await cacheProfileAvatar({ xUserId: "../123", avatarUrl: "https://pbs.twimg.com/profile_images/a.png", root, fetcher: fetchBytes(png) })).toBeNull();

  const path = await cacheProfileAvatar({ xUserId: "123", avatarUrl: "https://pbs.twimg.com/profile_images/a.png", root, fetcher: fetchBytes(png) });
  expect(path).toBe("/api/profile/avatar/123");
  const saved = await profileAvatarFile("123", root);
  expect(saved?.mime).toBe("image/png");
  expect(readFileSync(saved!.path)).toEqual(Buffer.from(png));

  expect(await cacheProfileAvatar({ xUserId: "123", avatarUrl: "https://pbs.twimg.com/profile_images/a.png", root, fetcher: fetchBytes(png, { "content-type": "image/svg+xml" }) })).toBeNull();
  expect(await cacheProfileAvatar({ xUserId: "123", avatarUrl: "https://pbs.twimg.com/profile_images/a.png", root, fetcher: fetchBytes(new Uint8Array(2 * 1024 * 1024 + 1)) })).toBeNull();
  const redirect = (async (_url: RequestInfo | URL, init?: RequestInit) => { expect(init?.redirect).toBe("error"); return new Response(null, { status: 302 }); }) as unknown as typeof fetch;
  expect(await cacheProfileAvatar({ xUserId: "123", avatarUrl: "https://pbs.twimg.com/profile_images/a.png", root, fetcher: redirect })).toBeNull();
  expect(readFileSync(saved!.path)).toEqual(Buffer.from(png));
});
