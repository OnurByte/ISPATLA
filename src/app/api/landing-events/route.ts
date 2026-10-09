import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isLandingEventPayload } from "@/lib/landing-measurement";
import { recordLandingEvent } from "@/server/landing-measurement";

export const runtime = "nodejs";

type Statement = { all(): unknown[]; run(...values: unknown[]): unknown };
type Database = { exec(sql: string): void; prepare(sql: string): Statement };
type DatabaseCtor = new (path: string) => Database;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const Database = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  ? (builtin("bun:sqlite") as { Database: DatabaseCtor }).Database
  : (builtin("node:sqlite") as { DatabaseSync: DatabaseCtor }).DatabaseSync;

function recordEvent(event: string, page: string, source: "direct" | "x" | "github" | "other"): void {
  const path = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.exec("PRAGMA busy_timeout=5000;");
    recordLandingEvent(db, event, page, Math.floor(Date.now() / 1000), source);
  } finally {
    (db as unknown as { close?: () => void }).close?.();
  }
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowedOrigins = [new URL(request.url).origin, process.env.BETTER_AUTH_URL].filter((value): value is string => !!value).map((value) => {
    try { return new URL(value).origin; } catch { return ""; }
  });
  if (!origin || !allowedOrigins.includes(origin)) return Response.json({ error: "invalid origin" }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return Response.json({ error: "JSON required" }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 512) return Response.json({ error: "invalid event" }, { status: 413 });
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "invalid event" }, { status: 400 });
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512) { await reader.cancel(); return Response.json({ error: "invalid event" }, { status: 413 }); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    body = JSON.parse(text);
  } catch { return Response.json({ error: "invalid event" }, { status: 400 }); }
  if (!isLandingEventPayload(body)) return Response.json({ error: "invalid event" }, { status: 400 });
  try {
    recordEvent(body.event, body.page, body.source);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "measurement unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
