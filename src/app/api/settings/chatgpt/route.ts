import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { beginChatGPTConnection, disconnectChatGPT, getChatGPTConnectionStatus } from "@/server/chatgpt-connection";

export const runtime = "nodejs";
async function GETHandler() { return NextResponse.json(await getChatGPTConnectionStatus(), { headers: { "cache-control": "no-store" } }); }
async function POSTHandler(request: Request) {
  const denied = guardMutation(request); if (denied) return denied;
  try { return NextResponse.json(await beginChatGPTConnection(new URL(request.url).hostname), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ChatGPT connection failed" }, { status: 400, headers: { "cache-control": "no-store" } }); }
}
async function DELETEHandler(request: Request) {
  const denied = guardMutation(request); if (denied) return denied;
  try { const result = await disconnectChatGPT(); return NextResponse.json({ connected: false, revocationConfirmed: result.revoked }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ChatGPT disconnect failed" }, { status: 400, headers: { "cache-control": "no-store" } }); }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
export const DELETE = withUser(DELETEHandler);
