import { expect, mock, test } from "bun:test";

let operatorOnly = false;
let rateLimited = false;
let scanCalls = 0;

mock.module("@/server/request-auth", () => ({
  withUser: (handler: (request: Request) => Promise<Response>, operator: boolean) => {
    operatorOnly = operator;
    return handler;
  },
}));
mock.module("@/server/api-guard", () => ({
  guardMutation: (_request: Request, limited: boolean) => {
    rateLimited = limited;
    return null;
  },
}));
mock.module("@/server/monitoring", () => ({ scanPostgresSources: async () => {
  scanCalls += 1;
  return { status: "partial", sourceCount: 1, postsSeen: 2, postsNew: 1, postsScored: 1, errors: ["source timeout"] };
} }));

test("source scan route keeps operator and mutation guards and exposes bounded scan counts", async () => {
  const { POST } = await import("../src/app/api/scan/route");
  const response = await POST(new Request("http://localhost/api/scan", { method: "POST" }));

  expect(operatorOnly).toBe(true);
  expect(rateLimited).toBe(true);
  expect(scanCalls).toBe(1);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "partial", sourceCount: 1, postsSeen: 2, postsNew: 1, postsScored: 1, errors: ["source timeout"] });
});
