import { expect, test } from "bun:test";
import { parseChatGPTStream, responseText } from "@/server/ai";

test("response text ignores metadata and missing content", () => {
  expect(responseText({ type: "message", content: [{ type: "output_text", text: "actual output" }] })).toBe("actual output");
  expect(responseText({ type: "message", output: [{ type: "output_text" }] })).toBeNull();
  expect(responseText(undefined)).toBeNull();
});

test("ChatGPT streaming parser accepts completed events and rejects missing or failed outcomes", () => {
  expect(parseChatGPTStream('event: response.completed\r\ndata: {"type":"response.completed","response":{"output":[]}}\r\n\r\n')).toEqual({ output: [] });
  expect(() => parseChatGPTStream('data: {"type":"response.incomplete"}\n\n')).toThrow("incomplete");
  expect(() => parseChatGPTStream('data: [DONE]\n\n')).toThrow("without a completed");
});
