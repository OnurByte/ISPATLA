import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core/dialect";

test("measurement HTTP boundary rejects foreign origins, extra fields and streamed excess; persists only aggregates", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const dialect = new PgDialect();
  mock.module("@/server/postgres", () => ({ getPostgresDb: () => ({ execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => { const compiled = dialect.sqlToQuery(query); calls.push({ sql: compiled.sql, values: compiled.params }); return { rows: [], rowCount: 1 }; } }) }));
  const { POST } = await import("../src/app/api/landing-events/route");
  const payload = { event: "demo_start", page: "/", source: "x" };
  const request = (body: unknown, origin = "http://localhost:3108") => new Request("http://localhost:3108/api/landing-events", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await POST(request(payload, "https://foreign.example"))).status).toBe(403);
  expect((await POST(request({ ...payload, userId: "private-identity" }))).status).toBe(400);
  expect((await POST(request({ ...payload, source: "https://x.com/private-path" }))).status).toBe(400);
  const oversized = new Request("http://localhost:3108/api/landing-events", { method: "POST", headers: { origin: "http://localhost:3108", "content-type": "application/json" }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(513)); controller.close(); } }), duplex: "half" } as RequestInit);
  expect((await POST(oversized)).status).toBe(413);
  expect((await POST(request(payload))).status).toBe(204);
  expect(calls).toHaveLength(2);
  expect(calls[0]?.sql).toContain("DELETE FROM ispatla_app.landing_event_daily");
  expect(calls[1]?.sql).toContain("ON CONFLICT(day,event,page,bucket,source)");
  expect(calls[1]?.values?.slice(1)).toEqual(["demo_start", "/", "x"]);
  expect(JSON.stringify(calls)).not.toContain("private");
});
