import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { beginChatGPTConnection, disconnectChatGPT, getChatGPTConnectionStatus } from "@/server/chatgpt-connection";

export const runtime = "nodejs";

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/ISPATLA_|environment|secret key|vault|not configured/i.test(message)) return "Bu bağlantı şu anda sunucuda hazır değil. Daha sonra yeniden deneyebilirsin.";
  return "ChatGPT bağlantısı tamamlanamadı. Hesabını kontrol edip yeniden dene.";
}

function GETHandler() {
  return NextResponse.json(getChatGPTConnectionStatus(), { headers: { "cache-control": "no-store" } });
}

async function POSTHandler(request: Request) {
  try {
    const result = await beginChatGPTConnection(new URL(request.url).hostname);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}

async function DELETEHandler() {
  try {
    const result = await disconnectChatGPT();
    return NextResponse.json({ connected: false, revocationConfirmed: result.revoked }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
export const DELETE = withUser(DELETEHandler);
