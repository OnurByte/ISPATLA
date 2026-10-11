import { expect, test } from "bun:test";
import { prepareShare, receiptMatches } from "../src/server/publishing-preparation";
test("preparing a share never reports publication or automatic scheduling", () => {
  const web = prepareShare("A&B ? test", "x_web_intent");
  expect(new URL(web.url!).searchParams.get("text")).toBe("A&B ? test");
  expect(web.verification).toBe("not_published");
  expect(web.automatic).toBe(false);
  expect(prepareShare("test", "x_native_schedule").scheduling).toBe("complete_on_x");
  expect(prepareShare("test", "manual_import").url).toBeNull();
});
test("unsupported content and targets are rejected", () => {
  expect(() => prepareShare("", "x_web_intent")).toThrow();
  expect(() => prepareShare("x".repeat(281), "x_web_intent")).toThrow();
  expect(() => prepareShare("reply", "x_web_intent", "bad", "reply")).toThrow();
  expect(() => prepareShare("dm", "x_web_intent", "", "dm")).toThrow();
  expect(new URL(prepareShare("reply", "x_web_intent", "123", "reply").url!).searchParams.get("in_reply_to")).toBe("123");
});

test("quote preparation validates and snapshots the actual shared text", () => {
  const share = prepareShare("quote", "x_web_intent", "123", "quote");
  expect(share.preparedText).toBe("quote\nhttps://x.com/i/web/status/123");
  expect(new URL(share.url!).searchParams.get("text")).toBe(share.preparedText);
  expect(() => prepareShare("x".repeat(280), "x_web_intent", "123", "quote")).toThrow();
});

test("receipts require observed reply and quote targets", () => {
  const base = { author: { id: "7" }, text: "reply" } as import("../src/server/x-reader").XPost;
  const snapshot = { x_user_id: "7", text: "reply", text_hash: "", format: "reply", target_id: "123" };
  expect(receiptMatches(base, snapshot)).toBe(false);
  expect(receiptMatches({ ...base, replyToPostId: "999" }, snapshot)).toBe(false);
  expect(receiptMatches({ ...base, quotedPostId: "123" }, { ...snapshot, format: "quote" })).toBe(true);
  expect(receiptMatches({ ...base, quotedPostId: "123", replyToPostId: "999" }, { ...snapshot, format: "quote" })).toBe(false);
  expect(receiptMatches({ ...base, quotedPostId: "999" }, { ...snapshot, format: "quote" })).toBe(false);
  expect(receiptMatches({ ...base, author: { ...base.author, id: "8" }, quotedPostId: "123" }, { ...snapshot, format: "quote" })).toBe(false);
});
