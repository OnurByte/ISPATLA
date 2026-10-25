import { expect, test } from "bun:test";
import { readBoundedBody } from "@/server/api-guard";
test("chunked bodies are cancelled at the byte budget before parsing", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/mcp/token", { method: "POST", body, duplex: "half" } as RequestInit);
  await expect(readBoundedBody(request, 16)).rejects.toThrow("too large");
  expect(cancelled).toBe(true);
});
test("body budgets count UTF-8 bytes and preserve split multibyte characters", async () => {
  const encoded = new TextEncoder().encode("𝕏");
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoded.slice(0, 2)); controller.enqueue(encoded.slice(2)); controller.close(); } });
  expect(await readBoundedBody(new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit), 4)).toBe("𝕏");
  await expect(readBoundedBody(new Request("http://localhost", { method: "POST", body: "𝕏" }), 3)).rejects.toThrow();
});
