import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { POST } from "../src/app/api/landing-events/route";

test("measurement HTTP boundary rejects foreign origins, extra fields and streamed excess; persists only aggregates", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-landing-test-"));
  const previous = process.env.ISPATLA_DB;
  const database = join(directory, "events.sqlite3");
  process.env.ISPATLA_DB = database;
  const payload = { event: "demo_start", page: "/", source: "x" };
  const request = (body: unknown, origin = "http://localhost:3108") => new Request("http://localhost:3108/api/landing-events", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    expect((await POST(request(payload, "https://foreign.example"))).status).toBe(403);
    expect((await POST(request({ ...payload, userId: "private-identity" }))).status).toBe(400);
    expect((await POST(request({ ...payload, source: "https://x.com/private-path" }))).status).toBe(400);
    const oversized = new Request("http://localhost:3108/api/landing-events", { method: "POST", headers: { origin: "http://localhost:3108", "content-type": "application/json" }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(513)); controller.close(); } }), duplex: "half" } as RequestInit);
    expect((await POST(oversized)).status).toBe(413);
    expect((await POST(request(payload))).status).toBe(204);
    const db = new Database(database, { readonly: true });
    try {
      const rows = db.prepare("SELECT event,page,source,count FROM landing_event_daily").all();
      expect(rows).toEqual([{ event: "demo_start", page: "/", source: "x", count: 1 }]);
      expect(JSON.stringify(rows)).not.toContain("private");
    } finally { db.close(); }
  } finally {
    if (previous === undefined) delete process.env.ISPATLA_DB; else process.env.ISPATLA_DB = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
