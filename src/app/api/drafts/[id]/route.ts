import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { deletePostgresDraft, getPostgresDraft, savePostgresDraft } from "@/server/postgres-drafts";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const current = await getPostgresDraft(id);
  if (!current) return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request);
    const draft = await savePostgresDraft({ id, accountId: body.accountId === undefined ? current.accountId : body.accountId === null ? null : Number(body.accountId),
      format: body.format === undefined ? current.format : String(body.format), text: body.text === undefined ? current.text : String(body.text),
      sourceHandle: body.sourceHandle === undefined ? current.sourceHandle : String(body.sourceHandle), sourceUrl: body.sourceUrl === undefined ? current.sourceUrl : String(body.sourceUrl) });
    return draft ? NextResponse.json(draft) : NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Draft kaydedilemedi" }, { status: 400 }); }
}
async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try { return await deletePostgresDraft(Number((await context.params).id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "draft bulunamadı" }, { status: 404 }); }
  catch { return NextResponse.json({ error: "Draft silinemedi" }, { status: 409 }); }
}
export const PATCH = withUser(PATCHHandler);
export const DELETE = withUser(DELETEHandler);
