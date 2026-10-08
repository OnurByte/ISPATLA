import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { removeSecret, saveSecret } from "@/server/vault";

export const runtime = "nodejs";

const KNOWN_KEYS = new Map([
  ["openai_api_key", "OpenAI"],
  ["compatible_api_key", "OpenAI-uyumlu AI"],
]);

async function PUTHandler(request: Request, context: { params: Promise<{ name: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const name = (await context.params).name;
  const provider = KNOWN_KEYS.get(name);
  if (!provider) return NextResponse.json({ error: "bilinmeyen secret" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const value = String(body.value || "").trim();
  if (!value) return NextResponse.json({ error: "secret değeri gerekli" }, { status: 400 });
  try {
    saveSecret(name, provider, value);
    return NextResponse.json({ ok: true, name, masked: "••••••••••••" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "secret kaydedilemedi" }, { status: 503 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ name: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  removeSecret((await context.params).name);
  return NextResponse.json({ ok: true });
}

export const PUT = withUser(PUTHandler);

export const DELETE = withUser(DELETEHandler);
