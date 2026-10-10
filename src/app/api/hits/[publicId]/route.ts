import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api-guard";
import { revokeOwnXPostShare, updateOwnHitLeaderboardParticipation } from "@/server/hit-sharing";
import { withUser } from "@/server/request-auth";

export const runtime = "nodejs";

export const DELETE = withUser(async (_request: Request, context: { params: Promise<{ publicId: string }> }) => {
  const { publicId } = await context.params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicId) || !await revokeOwnXPostShare(publicId)) {
    return NextResponse.json({ error: "paylaşım bulunamadı" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ revoked: true }, { headers: { "cache-control": "no-store" } });
});

export const PATCH = withUser(async (request: Request, context: { params: Promise<{ publicId: string }> }) => {
  const { publicId } = await context.params;
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).length !== 1 || typeof body.leaderboardOptIn !== "boolean") {
      return NextResponse.json({ error: "Katılım seçimi geçersiz" }, { status: 400 });
    }
    if (!await updateOwnHitLeaderboardParticipation(publicId, body.leaderboardOptIn)) {
      return NextResponse.json({ error: "Paylaşım bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ leaderboardOptIn: body.leaderboardOptIn }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Katılım güncellenemedi" }, { status: 400 });
  }
});
