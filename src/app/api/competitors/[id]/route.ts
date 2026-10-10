import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/server/owner-context";
import { deletePostgresCompetitor, getPostgresCompetitors, savePostgresCompetitor } from "@/server/postgres-sources-market";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const owner = currentOwnerId()!;
  const current = (await getPostgresCompetitors(owner)).find((competitor) => competitor.id === id);
  if (!current) return NextResponse.json({ error: "rakip bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request);
    return NextResponse.json(await savePostgresCompetitor(owner, {
      handle: String(body.handle ?? current.handle),
      name: String(body.name ?? current.name).slice(0, 120),
      category: String(body.category ?? current.category).slice(0, 240),
      enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
      now: Math.floor(Date.now() / 1000),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "rakip güncellenemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!await deletePostgresCompetitor(currentOwnerId()!, id)) return NextResponse.json({ error: "rakip bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withUser(PATCHHandler, true);

export const DELETE = withUser(DELETEHandler, true);
