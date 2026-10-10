import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { deletePostgresSecret, encryptPostgresSecret, postgresVaultReady, savePostgresSecret } from "@/server/postgres-settings";

export const runtime = "nodejs";

const KNOWN_KEYS = new Map([
  ["openai_api_key", "OpenAI"],
  ["anthropic_api_key", "Claude"],
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
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value) return NextResponse.json({ error: "secret değeri gerekli" }, { status: 400 });
  if (!postgresVaultReady()) return NextResponse.json({ error: "secret_storage_unavailable", message: "Güvenli anahtar kasası bu sunucuda henüz hazır değil." }, { status: 503 });
  try {
    await savePostgresSecret(name, provider, encryptPostgresSecret(value));
    return NextResponse.json({ ok: true, name, masked: "••••••••••••" });
  } catch {
    return NextResponse.json({ error: "secret_storage_unavailable", message: "Güvenli anahtar kasası şu anda kullanılamıyor." }, { status: 503 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ name: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const name = (await context.params).name;
  if (!KNOWN_KEYS.has(name)) return NextResponse.json({ error: "bilinmeyen secret" }, { status: 404 });
  await deletePostgresSecret(name);
  return NextResponse.json({ ok: true });
}

export const PUT = withUser(PUTHandler);

export const DELETE = withUser(DELETEHandler);
