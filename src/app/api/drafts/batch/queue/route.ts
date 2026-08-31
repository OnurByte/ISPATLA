import { NextResponse } from "next/server";
import { queueDraftIds } from "@/server/queue-service";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const draftIds = Array.isArray(body.draftIds)
    ? body.draftIds.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100)
    : [];
  if (!draftIds.length) return NextResponse.json({ error: "En az bir draft seçilmeli" }, { status: 400 });
  try {
    return NextResponse.json(queueDraftIds(draftIds), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "batch kuyruğa alınamadı" }, { status: 422 });
  }
}
