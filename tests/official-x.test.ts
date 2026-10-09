import { describe, expect, test } from "bun:test";
import { OfficialXClient, OfficialXError } from "../src/server/official-x";

const credentials = { accessToken: "test-access-token", xUserId: "12345" };
const ok = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify({ data }), { status, headers });

describe("Official X write client", () => {
  test("creates posts, eligible replies, and reposts using current v2 endpoints", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const client = new OfficialXClient(async (input, init = {}) => {
      seen.push({ url: String(input), init });
      if (String(input).endsWith("/retweets")) return ok({ retweeted: true });
      return ok({ id: "789", text: "hello" }, 201);
    });

    expect(await client.createPost(credentials, { text: "hello" })).toEqual({ id: "789", text: "hello" });
    expect(await client.reply(credentials, { text: "reply", postId: "456", summonedBy: "author_mention" })).toEqual({ id: "789", text: "hello" });
    expect(await client.repost(credentials, "456")).toEqual({ reposted: true });
    expect(seen.map(({ url }) => new URL(url).pathname)).toEqual(["/2/tweets", "/2/tweets", "/2/users/12345/retweets"]);
    expect(JSON.parse(String(seen[1]!.init.body))).toEqual({ text: "reply", reply: { in_reply_to_tweet_id: "456" } });
    expect(seen.every(({ init }) => new Headers(init.headers).get("authorization") === "Bearer test-access-token")).toBe(true);
  });

  test("reads only the authenticated account profile fields needed for personalization", async () => {
    let seen = "";
    const client = new OfficialXClient(async (input) => { seen = String(input); return ok({ id: credentials.xUserId, description: "Linux and open source" }); });
    expect(await client.getOwnProfile(credentials)).toEqual({ id: credentials.xUserId, description: "Linux and open source" });
    const url = new URL(seen);
    expect(url.pathname).toBe("/2/users/me");
    expect(url.searchParams.get("user.fields")).toBe("description,name,username,profile_image_url,public_metrics");
  });

  test("scans only the connected account timeline with bounded, capped post text", async () => {
    let seen = "";
    let authorization = "";
    const client = new OfficialXClient(async (input, init = {}) => {
      seen = String(input);
      authorization = new Headers(init.headers).get("authorization") ?? "";
      return ok([{ text: "Linux" }, { text: "x".repeat(4_500) }, { text: 42 }, {}]);
    });
    const posts = await client.getOwnTimeline(credentials, 10_000);
    const url = new URL(seen);
    expect(url.pathname).toBe("/2/users/12345/tweets");
    expect(url.searchParams.get("max_results")).toBe("100");
    expect(url.searchParams.get("tweet.fields")).toBe("created_at");
    expect(authorization).toBe("Bearer test-access-token");
    expect(posts).toHaveLength(2);
    expect(posts[0]).toBe("Linux");
    expect(posts[1]).toHaveLength(4_000);
  });

  test("blocks unsummoned/manual replies and unverified quote capability before network access", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return ok({ id: "1", text: "x" }); });
    for (const summonedBy of ["manual_approval", "unknown"] as const) {
      await expect(client.reply(credentials, { text: "reply", postId: "456", summonedBy })).rejects.toMatchObject({ code: "policy_blocked", remoteStateKnown: true });
    }
    await expect(client.quote(credentials, { text: "quote", postId: "456" })).rejects.toMatchObject({ code: "capability" });
    await expect(client.quote(credentials, { text: "quote", postId: "456" }, { quote: "disabled" })).rejects.toMatchObject({ code: "capability" });
    expect(calls).toBe(0);
  });

  test("only sends quote when caller supplies verified entitlement", async () => {
    let body: unknown;
    const client = new OfficialXClient(async (_input, init) => { body = JSON.parse(String(init?.body)); return ok({ id: "3", text: "quote" }, 201); });
    expect(await client.quote(credentials, { text: "quote", postId: "456" }, { quote: "enabled" })).toEqual({ id: "3", text: "quote" });
    expect(body).toEqual({ text: "quote", quote_tweet_id: "456" });
  });

  test("uploads bounded image chunks through initialize/append/finalize and returns processing state", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const client = new OfficialXClient(async (input, init = {}) => {
      const url = String(input);
      seen.push({ url, init });
      if (url.endsWith("/initialize")) return ok({ id: "98765", media_key: "key-1" });
      if (url.endsWith("/finalize")) return ok({ id: "98765", processing_info: { state: "in_progress", check_after_secs: 2 }, media_key: "key-1" });
      return new Response(null, { status: 204 });
    });
    const receipt = await client.uploadMedia(credentials, { bytes: new Uint8Array(1_100_000), mediaType: "image/png" });
    expect(receipt).toEqual({ mediaId: "98765", mediaKey: "key-1", processingState: "in_progress", checkAfterSeconds: 2 });
    expect(seen.map(({ url }) => new URL(url).pathname)).toEqual([
      "/2/media/upload/initialize", "/2/media/upload/98765/append", "/2/media/upload/98765/finalize",
    ]);
    const initBody = JSON.parse(String(seen[0]!.init.body));
    expect(initBody).toMatchObject({ media_category: "tweet_image", media_type: "image/png", total_bytes: 1_100_000 });
    expect(seen[1]!.init.body).toBeInstanceOf(FormData);
  });

  test("rejects unsupported and oversized media locally", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return ok({ id: "m" }); });
    await expect(client.uploadMedia(credentials, { bytes: new Uint8Array([1]), mediaType: "application/pdf" })).rejects.toMatchObject({ code: "invalid_media" });
    await expect(client.uploadMedia(credentials, { bytes: new Uint8Array(5 * 1024 * 1024 + 1), mediaType: "image/jpeg" })).rejects.toMatchObject({ code: "invalid_media" });
    await expect(client.uploadMedia(credentials, { bytes: new Uint8Array(15 * 1024 * 1024 + 1), mediaType: "image/gif" })).rejects.toMatchObject({ code: "invalid_media" });
    await expect(client.uploadMedia(credentials, { bytes: new Uint8Array(512 * 1024 * 1024 + 1), mediaType: "video/mp4" })).rejects.toMatchObject({ code: "invalid_media" });
    expect(calls).toBe(0);
  });

  test("preserves rate-limit metadata without retrying", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return new Response("{}", { status: 429, headers: { "retry-after": "30", "x-rate-limit-reset": "1900000000" } }); });
    let error: unknown;
    try { await client.createPost(credentials, { text: "hello" }); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(OfficialXError);
    expect(error).toMatchObject({ code: "rate_limited", retryAfter: "30", rateLimitReset: 1900000000, safeToRetry: false, remoteStateKnown: true });
    expect(calls).toBe(1);
  });

  test("maps auth and capability responses to safe typed errors", async () => {
    for (const [status, code] of [[401, "reauth"], [403, "capability"]] as const) {
      const client = new OfficialXClient(async () => new Response(JSON.stringify({ detail: "private provider body" }), { status }));
      await expect(client.createPost(credentials, { text: "hello" })).rejects.toMatchObject({ code, safeToRetry: false, remoteStateKnown: true });
    }
  });

  test("classifies explicit write 5xx responses as unknown state without retrying inline", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return new Response("{}", { status: 503 }); });
    await expect(client.createPost(credentials, { text: "hello" })).rejects.toMatchObject({ code: "unknown_remote_state", safeToRetry: false, remoteStateKnown: false });
    expect(calls).toBe(1);
  });

  test("classifies read 5xx as retryable and supports exact post receipt reads", async () => {
    const actions: string[] = [];
    let client = new OfficialXClient(async (input) => { actions.push(String(input)); return new Response("{}", { status: 503 }); });
    await expect(client.getPost(credentials, "42")).rejects.toMatchObject({ code: "known_retryable", safeToRetry: true, remoteStateKnown: true });
    client = new OfficialXClient(async (input) => { actions.push(String(input)); return ok({ id: "42", text: "confirmed" }); });
    expect(await client.getPost(credentials, "42")).toMatchObject({ id: "42", text: "confirmed" });
    expect(actions).toHaveLength(2);
    expect(actions.at(-1)).toContain("/2/tweets/42?");
  });

  test("looks up authenticated user among bounded repost pages and leaves partial absence incomplete", async () => {
    const seen: string[] = [];
    const client = new OfficialXClient(async (input) => {
      const url = new URL(String(input)); seen.push(url.toString());
      if (!url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "11" }], meta: { next_token: "next-page" } }));
      return new Response(JSON.stringify({ data: [{ id: credentials.xUserId }] }));
    });
    expect(await client.getRepostedBy(credentials, "765", 2)).toEqual({ userIds: ["11", credentials.xUserId], complete: true });
    expect(seen).toHaveLength(2);
    expect(new URL(seen[0]!).pathname).toBe("/2/tweets/765/retweeted_by");
    expect(new URL(seen[1]!).searchParams.get("pagination_token")).toBe("next-page");

    const partial = new OfficialXClient(async () => new Response(JSON.stringify({ data: [{ id: "11" }], meta: { next_token: "more" } })));
    expect(await partial.getRepostedBy(credentials, "765", 1)).toEqual({ userIds: ["11"], complete: false });
  });

  test("reposted-by read preserves rate-limit classification without retries", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return new Response("{}", { status: 429, headers: { "retry-after": "25" } }); });
    await expect(client.getRepostedBy(credentials, "765")).rejects.toMatchObject({ code: "rate_limited", retryAfter: "25", safeToRetry: false, remoteStateKnown: true });
    expect(calls).toBe(1);
  });

  test("treats malformed successful write receipts as unknown and rejects malformed credential IDs", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; return ok({ id: "not-a-receipt" }, 201); });
    await expect(client.createPost(credentials, { text: "hello" })).rejects.toMatchObject({ code: "unknown_remote_state", safeToRetry: false, remoteStateKnown: false });
    await expect(client.repost(credentials, "12")).rejects.toMatchObject({ code: "unknown_remote_state", safeToRetry: false, remoteStateKnown: false });
    await expect(client.createPost({ ...credentials, xUserId: "not-numeric" }, { text: "hello" })).rejects.toMatchObject({ code: "reauth" });
    expect(calls).toBe(2);
  });

  test("polls media status a bounded number of times and treats image finalize without processing as ready", async () => {
    let calls = 0;
    const client = new OfficialXClient(async (input) => {
      calls++;
      if (String(input).includes("media_id=")) return ok({ id: "66", processing_info: { state: "succeeded" } });
      return ok({ id: "55" });
    });
    expect(await client.pollMediaStatus(credentials, "66", 99)).toEqual({ mediaId: "66", processingState: "succeeded" });
    expect(calls).toBe(1);
  });

  test("accepts bounded MP4 and GIF media with their dedicated upload categories", async () => {
    const categories: string[] = [];
    const client = new OfficialXClient(async (input, init = {}) => {
      if (String(input).endsWith("/initialize")) {
        categories.push(String((JSON.parse(String(init.body)) as { media_category: string }).media_category));
        return ok({ id: "77" });
      }
      if (String(input).endsWith("/finalize")) return ok({ id: "77" });
      return new Response(null, { status: 204 });
    });
    const video = await client.uploadMedia(credentials, { bytes: new Uint8Array([1, 2, 3]), mediaType: "video/mp4" });
    const gif = await client.uploadMedia(credentials, { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/gif" });
    expect(categories).toEqual(["tweet_video", "tweet_gif"]);
    expect(video.processingState).toBe("unknown");
    expect(gif.processingState).toBe("unknown");
  });

  test("marks lost write response as unknown remote state and never retries", async () => {
    let calls = 0;
    const client = new OfficialXClient(async () => { calls++; throw new TypeError("socket lost; token=secret; post body leaked?"); });
    await expect(client.createPost(credentials, { text: "private text" })).rejects.toMatchObject({ code: "unknown_remote_state", safeToRetry: false, remoteStateKnown: false });
    expect(calls).toBe(1);
  });
});
