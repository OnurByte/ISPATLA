import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { queueDraftIds } from "@/server/queue-service";

export const runtime = "nodejs";
async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Geçersiz draft" }, { status: 400 });
  try { return NextResponse.json(await queueDraftIds([id])); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Kuyruğa eklenemedi" }, { status: 400 }); }
}
export const POST = withUser(POSTHandler);
