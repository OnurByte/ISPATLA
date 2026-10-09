import { NextResponse } from "next/server";
import { listChatGPTModels } from "@/server/ai";
import { withUser } from "@/server/request-auth";

export const runtime = "nodejs";

export const GET = withUser(async () => {
  try {
    return NextResponse.json({ models: await listChatGPTModels() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ChatGPT modelleri alınamadı. Bağlantını yenile ve tekrar dene." }, { status: 502 });
  }
});
