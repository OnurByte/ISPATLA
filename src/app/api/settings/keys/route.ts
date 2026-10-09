import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { listSecretMetas, vaultReady } from "@/server/vault";

export const runtime = "nodejs";

const KNOWN_KEYS = [
  { name: "openai_api_key", provider: "OpenAI" },
  { name: "anthropic_api_key", provider: "Claude" },
  { name: "compatible_api_key", provider: "OpenAI-uyumlu AI" },
];

function GETHandler() {
  const configured = new Map(listSecretMetas().map((secret) => [secret.name, secret]));
  return NextResponse.json({
    vaultReady: vaultReady(),
    keys: KNOWN_KEYS.map((key) => configured.get(key.name) || { ...key, configured: false, masked: "ayarlı değil", updatedAt: 0 }),
  });
}

export const GET = withUser(GETHandler);
