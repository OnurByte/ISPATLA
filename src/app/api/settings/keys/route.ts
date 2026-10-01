import { NextResponse } from "next/server";
import { listSecretMetas, vaultReady } from "@/server/vault";

export const runtime = "nodejs";

const KNOWN_KEYS = [
  { name: "openai_api_key", provider: "OpenAI" },
  { name: "compatible_api_key", provider: "OpenAI-uyumlu AI" },
  { name: "xuse_credential", provider: "x-use (eski)" },
  { name: "x_api_bearer", provider: "X API — Bearer" },
  { name: "x_api_client_id", provider: "X API — OAuth client id" },
  { name: "x_api_client_secret", provider: "X API — OAuth client secret" },
  { name: "jev_api_key", provider: "Jev" },
];

export function GET() {
  const configured = new Map(listSecretMetas().map((secret) => [secret.name, secret]));
  return NextResponse.json({
    vaultReady: vaultReady(),
    keys: KNOWN_KEYS.map((key) => configured.get(key.name) || { ...key, configured: false, masked: "ayarlı değil", updatedAt: 0 }),
  });
}
