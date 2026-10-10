import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api-guard";
import { setPostgresHitEvidenceExcluded } from "@/server/postgres-hit-moderation";
import { withUser } from "@/server/request-auth";

export const runtime = "nodejs";
export const PATCH = withUser(async (request: Request, context: { params: Promise<{ publicId: string }> }) => {
  try {
    const { publicId } = await context.params;
    const body = await readJsonBody(request);
    if (Object.keys(body).some((key) => !["excluded", "reason"].includes(key)) || typeof body.excluded !== "boolean" || typeof body.reason !== "string") {
      return NextResponse.json({ error: "Moderasyon seçimi geçersiz" }, { status: 400 });
    }
    if (!await setPostgresHitEvidenceExcluded(publicId, body.excluded, body.reason)) return NextResponse.json({ error: "Paylaşım bulunamadı" }, { status: 404 });
    return NextResponse.json({ excluded: body.excluded }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Moderasyon güncellenemedi" }, { status: 400 });
  }
}, true);
