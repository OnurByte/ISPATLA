import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { approvePostgresPublicationIntent, getPostgresPublicationIntent, setPostgresPublicationIntentStatus } from "@/server/postgres-queue-store";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "geçersiz publication id" }, { status: 400 });
    const body = await readJsonBody(request);
    const action = String(body.action || "");
    if (action === "approve") {
      const intent = await approvePostgresPublicationIntent({ id, now: Math.floor(Date.now() / 1000) });
      return intent ? NextResponse.json(intent) : NextResponse.json({ error: "publication intent onaylanamadı" }, { status: 409 });
    }
    if (action === "cancel") {
      const current = await getPostgresPublicationIntent(id);
      if (!current) return NextResponse.json({ error: "publication intent bulunamadı" }, { status: 404 });
      const intent = await setPostgresPublicationIntentStatus({ id, status: "cancelled", reason: "kullanıcı iptal etti", now: Math.floor(Date.now() / 1000) });
      return intent ? NextResponse.json(intent) : NextResponse.json({ error: "publication intent iptal edilemedi" }, { status: 409 });
    }
    return NextResponse.json({ error: "action approve veya cancel olmalı" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "publication intent güncellenemedi" }, { status: 422 });
  }
}

export const POST = withUser(POSTHandler);
