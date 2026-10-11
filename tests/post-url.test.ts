import { expect, test } from "bun:test";
import { internalPostUrl, postIdFromUrl, postViewUrl } from "../src/lib/post-url";
test("post IDs preserve precision and reject malformed or oversized IDs", () => {
  expect(internalPostUrl("1234567890123456789")).toBe("/post/1234567890123456789");
  for (const id of ["", "../1", "1?x=1", "12345678901234567890"]) expect(() => internalPostUrl(id)).toThrow();
});
test("only safe X status links become internal viewer links", () => {
  expect(postViewUrl("https://x.com/test/status/123?s=20")).toBe("/post/123");
  expect(postIdFromUrl("https://twitter.com/i/web/status/123")).toBe("123");
  for (const url of ["http://x.com/a/status/1", "https://x.com.evil/a/status/1", "https://user@x.com/a/status/1", "https://x.com:8443/a/status/1", "https://x.com/a/status/1/extra"]) expect(postIdFromUrl(url)).toBeNull();
  expect(postViewUrl("https://example.com/article")).toBe("https://example.com/article");
});
