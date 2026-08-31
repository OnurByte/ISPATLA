import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { approvePublicationIntent, cancelPublicationIntent } from "@/server/publication-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const id = Number((await context.params).id);
    const body = await readJsonBody(request);
    const action = String(body.action || "");
    if (action === "approve") return NextResponse.json(approvePublicationIntent(id));
    if (action === "cancel") return NextResponse.json(cancelPublicationIntent(id));
    return NextResponse.json({ error: "action approve veya cancel olmalı" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "publication intent güncellenemedi" }, { status: 422 });
  }
}
