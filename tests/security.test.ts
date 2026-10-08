import { describe, expect, test } from "bun:test";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { proxy } from "@/proxy";
import {
  adminTokenState,
  isAllowedAvatarUrl,
  isAllowedFxTwitterFeed,
  isAllowedMediaContentType,
  isAllowedMediaUrl,
  safeStatusUrl,
} from "@/server/security";

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("security boundaries", () => {
  test("only accepts HTTPS FxTwitter and exact media hosts", () => {
    expect(isAllowedFxTwitterFeed("https://api.fxtwitter.com/2/profile/foo/statuses")).toBe(true);
    expect(isAllowedFxTwitterFeed("http://api.fxtwitter.com/2/profile/foo/statuses")).toBe(false);
    expect(isAllowedFxTwitterFeed("https://api.fxtwitter.com.evil.example/feed")).toBe(false);
    expect(isAllowedFxTwitterFeed("http://169.254.169.254/latest/meta-data")).toBe(false);

    expect(isAllowedMediaUrl("https://pbs.twimg.com/media/photo.jpg", "photo")).toBe(true);
    expect(isAllowedMediaUrl("https://pbs.twimg.com.evil.example/photo.jpg", "photo")).toBe(false);
    expect(isAllowedMediaUrl("https://video.twimg.com/ext_tw_video/1/vid/avc1/clip.mp4", "video")).toBe(true);
    expect(isAllowedAvatarUrl("https://pbs.twimg.com/profile_images/1/avatar_normal.jpg")).toBe(true);
    expect(isAllowedAvatarUrl("https://pbs.twimg.com/media/not-an-avatar.jpg")).toBe(false);
  });

  test("turns untrusted tweet URLs into safe X links", () => {
    expect(safeStatusUrl("javascript:alert(1)", "bpthaber", "123")).toBe(
      "https://x.com/bpthaber/status/123",
    );
    expect(safeStatusUrl("https://evil.example/status/123", "bpthaber", "123")).toBe(
      "https://x.com/bpthaber/status/123",
    );
    expect(safeStatusUrl("https://x.com/bpthaber/status/123?x=1#frag", "bpthaber", "123")).toBe(
      "https://x.com/bpthaber/status/123",
    );
  });

  test("requires a production admin token and compares it as a bearer secret", () => {
    withEnv({ NODE_ENV: "production", ISPATLA_ADMIN_TOKEN: undefined }, () => {
      expect(adminTokenState(new Request("http://localhost/api/scan"))).toBe("missing");
      expect(guardMutation(new Request("http://localhost/api/scan"))?.status).toBe(503);
    });

    withEnv({ NODE_ENV: "production", ISPATLA_ADMIN_TOKEN: "test-secret" }, () => {
      expect(adminTokenState(new Request("http://localhost/api/scan"))).toBe("invalid");
      const validRequest = new Request("http://localhost/api/scan", {
        headers: { authorization: "Bearer test-secret" },
      });
      expect(adminTokenState(validRequest)).toBe("ok");
      expect(guardMutation(validRequest)).toBeNull();
      expect(guardMutation(validRequest)).toBeNull();
      expect(guardMutation(validRequest, true)).toBeNull();
      expect(guardMutation(validRequest, true)?.status).toBe(429);
    });
  });

  test("keeps public pages reachable and redirects app pages without a session cookie", () => {
    expect(proxy(new Request("http://localhost/"))).toMatchObject({ status: 200 });
    expect(proxy(new Request("http://localhost/login"))).toMatchObject({ status: 200 });
    expect(proxy(new Request("http://localhost/app"))).toMatchObject({ status: 307 });
    expect(proxy(new Request("http://localhost/app/accounts"))).toMatchObject({ status: 307 });
    // Cookie presence skips only the fast redirect; request/page auth validates it.
    expect(proxy(new Request("http://localhost/app", { headers: { cookie: "better-auth.session_token=forged" } }))).toMatchObject({ status: 200 });
  });

  test("bounds inbound JSON bodies and rejects non-object payloads", async () => {
    const small = new Request("http://localhost/api/sources", {
      method: "POST",
      body: JSON.stringify({ handle: "ntv" }),
      headers: { "content-type": "application/json" },
    });
    expect(await readJsonBody(small)).toEqual({ handle: "ntv" });

    const oversized = new Request("http://localhost/api/sources", {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1),
    });
    await expect(readJsonBody(oversized)).rejects.toThrow("JSON body exceeds 1 MiB");

    const declaredOversize = new Request("http://localhost/api/sources", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(2 * 1024 * 1024) },
    });
    await expect(readJsonBody(declaredOversize)).rejects.toThrow("JSON body exceeds 1 MiB");

    const arrayBody = new Request("http://localhost/api/sources", { method: "POST", body: "[1,2]" });
    expect(await readJsonBody(arrayBody)).toEqual({});
  });

  test("matches media content types to the selected kind", () => {
    expect(isAllowedMediaContentType("photo", "image/jpeg")).toBe(true);
    expect(isAllowedMediaContentType("photo", "IMAGE/WEBP")).toBe(true);
    expect(isAllowedMediaContentType("photo", "video/mp4")).toBe(false);
    expect(isAllowedMediaContentType("video", "video/mp4")).toBe(true);
    expect(isAllowedMediaContentType("video", "text/html")).toBe(false);
    expect(isAllowedMediaContentType("photo", "")).toBe(false);
  });
});
