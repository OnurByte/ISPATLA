import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { queueDraftIds } from "@/server/queue-service";

export const runtime = "nodejs";
async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    if (!Array.isArray(body.draftIds) || !body.draftIds.length || body.draftIds.length > 100
      || body.draftIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      return NextResponse.json({ error: "1–100 arası geçerli draft kimliği gerekli" }, { status: 400 });
    }
    return NextResponse.json(await queueDraftIds(body.draftIds));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Toplu kuyruk oluşturulamadı" }, { status: 400 }); }
}
export const POST = withUser(POSTHandler);
