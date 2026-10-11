import { expect, test } from "bun:test";
import { FxTwitterReader, normalizeFxPost } from "@/server/x-reader";

test("FxTwitter reader normalizes profile data and records health", async () => {
  const previous = globalThis.fetch;
  let url = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    url = String(input);
    return new Response(JSON.stringify({ user: { screen_name: "source", name: "Source", followers: 12 } }));
  }) as typeof fetch;
  try {
    const reader = new FxTwitterReader();
    await expect(reader.fetchProfile({ handle: "source" })).resolves.toMatchObject({ handle: "source", name: "Source", followers: 12 });
    expect(url).toBe("https://api.fxtwitter.com/2/profile/source");
    expect(reader.health()).toMatchObject({ transport: "fxtwitter", ok: true });
    expect(reader.capabilities()).toMatchObject({ timeline: true, search: true, conversation: true });
  } finally {
    globalThis.fetch = previous;
  }
});

test("FxTwitter reader keeps X handles locale-independent", () => {
  const post = normalizeFxPost({
    id: "1",
    text: "test",
    author: { screen_name: "OPENAI" },
  });
  expect(post?.author.handle).toBe("openai");
});

test("FxTwitter pagination uses bottom cursor, deduplicates IDs and rejects JSON errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ code: 200, cursor: { top: "top", bottom: "next-page" }, results: [{ id: "123", text: "post", author: { screen_name: "source" } }, { id: "123", text: "duplicate", author: { screen_name: "source" } }] })) as unknown as typeof fetch;
    const batch = await new FxTwitterReader().fetchTimeline({ handle: "source" });
    expect(batch.cursor).toBe("next-page"); expect(batch.posts).toHaveLength(1);
    globalThis.fetch = (async () => Response.json({ code: 404, message: "not found" })) as unknown as typeof fetch;
    await expect(new FxTwitterReader().fetchTimeline({ handle: "source" })).rejects.toThrow("404");
    globalThis.fetch = (async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
    const reader = new FxTwitterReader();
    await expect(reader.fetchTimeline({ handle: "source" })).rejects.toThrow("429"); expect(reader.health().ok).toBe(false);
  } finally { globalThis.fetch = original; }
});
test("normalized quote and reply evidence is bounded and validates numeric IDs", () => {
  const post = normalizeFxPost({ id: "1", text: "outer", replying_to_status: "2", quote: { id: "3", text: "quote", quote: { id: "4", text: "nested" } } });
  expect(post?.replyToPostId).toBe("2"); expect(post?.quotedPostId).toBe("3"); expect(post?.quotedPost?.quotedPost).toBeUndefined();
  expect(normalizeFxPost({ id: "1".repeat(20), text: "oversized" })).toBeNull();
});
