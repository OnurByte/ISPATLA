import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler() {
  return NextResponse.json({ available: false, models: [], updatedAt: null, error: "AI arena verisi PostgreSQL geçişi sırasında kullanılamıyor." }, { status: 503 });
}
export const GET = withUser(GETHandler);
