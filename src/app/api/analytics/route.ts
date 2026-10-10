import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAnalytics, parseAnalyticsParams } from "@/server/postgres-analytics";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  const input = parseAnalyticsParams(new URL(request.url).searchParams);
  if (!input) return NextResponse.json({ error: "accountId veya rangeDays geçersiz" }, { status: 400 });
  const owner = currentOwnerId();
  if (!owner) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  try {
    const analytics = await getPostgresAnalytics(owner, input);
    if (!analytics) return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
    return NextResponse.json(analytics);
  } catch {
    return NextResponse.json({ error: "PostgreSQL analitiği şu anda kullanılamıyor" }, { status: 503 });
  }
}

export const GET = withUser(GETHandler);
