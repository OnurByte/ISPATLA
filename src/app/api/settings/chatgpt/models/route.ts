import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { listChatGPTModels } from "@/server/ai";

export const runtime = "nodejs";

export const GET = withUser(async () => {
  try { return NextResponse.json({ models: await listChatGPTModels(), runtimeAvailable: true }, { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ models: [], runtimeAvailable: true, error: "ChatGPT model list is unavailable." }, { status: 502, headers: { "cache-control": "no-store" } }); }
});
