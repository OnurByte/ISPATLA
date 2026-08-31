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
