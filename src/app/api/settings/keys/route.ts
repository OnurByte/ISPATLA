import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { listPostgresSecretMetas, postgresVaultReady } from "@/server/postgres-settings";

export const runtime = "nodejs";

const KNOWN_KEYS = [
  { name: "openai_api_key", provider: "OpenAI" },
  { name: "anthropic_api_key", provider: "Claude" },
  { name: "compatible_api_key", provider: "OpenAI-uyumlu AI" },
];

async function GETHandler() {
  const configured = new Map((await listPostgresSecretMetas()).map((secret) => [secret.name, secret]));
  return NextResponse.json({
    vaultReady: postgresVaultReady(),
    keys: KNOWN_KEYS.map((key) => configured.get(key.name) || { ...key, configured: false, masked: "ayarlı değil", updatedAt: 0 }),
  });
}

export const GET = withUser(GETHandler);
