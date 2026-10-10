import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return NextResponse.json({ error: "Bağlantı testi PostgreSQL yayıncısı tamamlanana kadar kullanılamıyor" }, { status: 503 });
}

export const POST = withUser(POSTHandler);
