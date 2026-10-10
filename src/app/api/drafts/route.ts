import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getPostgresDrafts, savePostgresDraft } from "@/server/postgres-drafts";

export const runtime = "nodejs";

async function GETHandler() {
  try { return NextResponse.json(await getPostgresDrafts()); }
  catch { return NextResponse.json({ error: "Draft veritabanı hazır değil" }, { status: 503 }); }
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    if (typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "Manuel draft metni gerekli" }, { status: 400 });
    const draft = await savePostgresDraft({ externalId: typeof body.externalId === "string" ? body.externalId : "", accountId: body.accountId == null ? null : Number(body.accountId),
      format: typeof body.format === "string" ? body.format : "post", text: body.text,
      sourceHandle: typeof body.sourceHandle === "string" ? body.sourceHandle : "", sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : "" });
    return NextResponse.json(draft, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Draft kaydedilemedi" }, { status: 400 }); }
}
export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
