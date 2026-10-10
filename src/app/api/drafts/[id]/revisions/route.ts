import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { getPostgresDraft, getPostgresDraftRevisions } from "@/server/postgres-drafts";

export const runtime = "nodejs";
async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1 || !await getPostgresDraft(id)) return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  try { return NextResponse.json(await getPostgresDraftRevisions(id)); }
  catch { return NextResponse.json({ error: "Draft geçmişi hazır değil" }, { status: 503 }); }
}
export const GET = withUser(GETHandler);
