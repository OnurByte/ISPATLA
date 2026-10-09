import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { proxy } from "@/proxy";
import {
  adminTokenState,
  isAllowedAvatarUrl,
  isAllowedFxTwitterFeed,
  isAllowedMediaContentType,
  isAllowedMediaUrl,
  isPublicProviderAddress,
  compatibleProviderUrl,
  MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES,
  pinnedProviderLookup,
  readNativeProviderResponse,
  requestCompatibleProvider,
  safeStatusUrl,
  validateCompatibleProviderEndpoint,
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
  test("rejects non-public compatible provider URLs and addresses", () => {
    for (const url of [
      "http://gateway.example/v1",
      "https://localhost/v1",
      "https://service.local/v1",
      "https://127.0.0.1/v1",
      "https://[::1]/v1",
      "https://user:pass@gateway.example/v1",
      "https://gateway.example/v1?token=secret",
      "https://gateway.example/v1#fragment",
    ]) expect(compatibleProviderUrl(url)).toBeNull();
    for (const address of [
      "0.0.0.1", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.1.2",
      "172.16.0.1", "192.168.1.1", "198.18.0.1", "203.0.113.1", "224.0.0.1",
      "::", "::1", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1",
    ]) expect(isPublicProviderAddress(address)).toBe(false);
    expect(compatibleProviderUrl("https://gateway.example/v1")?.hostname).toBe("gateway.example");
    expect(isPublicProviderAddress("8.8.8.8")).toBe(true);
    expect(isPublicProviderAddress("2606:4700:4700::1111")).toBe(true);
  });

  test("rejects any private DNS answer and pins network lookup to the validated address", async () => {
    await expect(validateCompatibleProviderEndpoint("https://gateway.example/v1", async () => ["8.8.8.8", "10.0.0.4"]))
      .rejects.toThrow("güvenli, herkese açık IP");
    await expect(validateCompatibleProviderEndpoint("https://gateway.example/v1", async () => []))
      .rejects.toThrow("güvenli, herkese açık IP");
    await expect(requestCompatibleProvider({
      url: "https://gateway.example/v1/chat/completions",
      method: "POST",
      headers: {},
      body: "{}",
      timeoutMs: 100,
      resolver: async () => ["169.254.169.254"],
    })).rejects.toThrow("güvenli, herkese açık IP");

    const lookup = pinnedProviderLookup("8.8.8.8");
    const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup("gateway.example", {}, (error, address, family) => {
        if (error) return reject(error);
        if (typeof address !== "string" || family === undefined) return reject(new Error("expected one pinned provider address"));
        resolve({ address, family });
      });
    });
    expect(result).toEqual({ address: "8.8.8.8", family: 4 });
  });

  test("caps compatible-provider response bytes and cancels oversized fetch streams", async () => {
    const previousFetch = globalThis.fetch;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    globalThis.fetch = (async () => new Response(stream)) as unknown as typeof fetch;
    try {
      await expect(requestCompatibleProvider({
        url: "https://gateway.example/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
        timeoutMs: 100,
      })).rejects.toThrow("response exceeds 1 MiB");
      expect(cancelled).toBe(true);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("caps native HTTPS response streams and aborts the request once", async () => {
    const response = new PassThrough() as PassThrough & { statusCode: number };
    response.statusCode = 200;
    let aborts = 0;
    const result = readNativeProviderResponse(response as never, () => { aborts += 1; });
    response.write(Buffer.alloc(MAX_COMPATIBLE_PROVIDER_RESPONSE_BYTES));
    response.write(Buffer.from([1]));
    await expect(result).rejects.toThrow("response exceeds 1 MiB");
    expect(aborts).toBe(1);
  });

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

  test("keeps public pages reachable and redirects private pages without a session cookie", () => {
    expect(proxy(new Request("http://localhost/"))).toMatchObject({ status: 200 });
    expect(proxy(new Request("http://localhost/login"))).toMatchObject({ status: 200 });
    expect(proxy(new Request("http://localhost/dashboard"))).toMatchObject({ status: 307 });
    expect(proxy(new Request("http://localhost/settings/profile"))).toMatchObject({ status: 307 });
    expect(proxy(new Request("http://localhost/app"))).toMatchObject({ status: 200 });
    // Cookie presence skips only the fast redirect; request/page auth validates it.
    expect(proxy(new Request("http://localhost/dashboard", { headers: { cookie: "better-auth.session_token=forged" } }))).toMatchObject({ status: 200 });
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
