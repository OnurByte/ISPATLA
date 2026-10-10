import { expect, mock, test } from "bun:test";

let operatorOnly = false;
let rateLimited = false;
let reconcileCalls = 0;

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
  readJsonBody: async (request: Request) => request.json(),
}));
mock.module("@/server/publication-service", () => ({
  reconcilePublicationIntents: async () => {
    reconcileCalls += 1;
    return 2;
  },
}));

test("reconciliation route uses the authenticated operator guard and reports PostgreSQL confirmations", async () => {
  const { POST } = await import("../src/app/api/reconcile/route");
  const response = await POST(new Request("http://localhost/api/reconcile", { method: "POST" }));

  expect(operatorOnly).toBe(true);
  expect(rateLimited).toBe(true);
  expect(reconcileCalls).toBe(1);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ confirmed: 2 });
});
