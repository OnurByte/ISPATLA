import { isLandingEventPayload } from "@/lib/landing-measurement";
import { recordLandingEvent } from "@/server/landing-measurement";

export const runtime = "nodejs";

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
    await recordLandingEvent(body.event, body.page, Math.floor(Date.now() / 1000), body.source);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "measurement unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
