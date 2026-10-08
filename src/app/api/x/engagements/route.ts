import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";

export const runtime = "nodejs";

function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return NextResponse.json({ error: "Etkileşim otomasyonu bu üründe kullanılamaz." }, { status: 410 });
}

export const POST = withUser(POSTHandler);
