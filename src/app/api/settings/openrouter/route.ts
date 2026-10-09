import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { beginOpenRouterOAuth, disconnectOpenRouter, openRouterConnected } from "@/server/openrouter-oauth";
import { NextResponse } from "next/server";
import { vaultReady } from "@/server/vault";

export const runtime = "nodejs";

function GETHandler() { return NextResponse.json({ connected: openRouterConnected() }); }
function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  if (!vaultReady()) return NextResponse.json({ error: "secret_storage_unavailable", message: "Güvenli bağlantı kasası bu sunucuda henüz hazır değil." }, { status: 503 });
  try {
    const base = process.env.BETTER_AUTH_URL || new URL(request.url).origin;
    const callback = new URL("/api/settings/openrouter/callback", base).toString();
    return NextResponse.json({ authorizationUrl: beginOpenRouterOAuth(callback) });
  } catch {
    return NextResponse.json({ error: "Bağlantı başlatılamadı. Biraz sonra yeniden dene." }, { status: 503 });
  }
}
function DELETEHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  disconnectOpenRouter();
  return NextResponse.json({ connected: false });
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
export const DELETE = withUser(DELETEHandler);
