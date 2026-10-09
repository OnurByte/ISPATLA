import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api-guard";
import { getHitSharingSettings, shareOwnXPost } from "@/server/hit-sharing";
import { withUser } from "@/server/request-auth";

export const runtime = "nodejs";

export const GET = withUser(() => NextResponse.json(getHitSharingSettings(), {
  headers: { "cache-control": "no-store" },
}));

export const POST = withUser(async (request: Request) => {
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).some((key) => key !== "remotePostId") || typeof body.remotePostId !== "string") {
      return NextResponse.json({ error: "𝕏 gönderi kimliği gerekli" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const share = shareOwnXPost(body.remotePostId);
    return NextResponse.json({ ...share, path: `/h/${share.publicId}` }, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "paylaşım oluşturulamadı" }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
});
