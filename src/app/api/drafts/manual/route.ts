import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { createManualDraftBatch } from "@/server/manual-drafts";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";
async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const result = await createManualDraftBatch({
      prompt: typeof body.prompt === "string" ? body.prompt : "",
      text: typeof body.text === "string" ? body.text : "",
      accountIds: Array.isArray(body.accountIds) ? body.accountIds.map(Number) : [],
      format: String(body.format || "post"),
      variantMode: body.variantMode === "same_text" ? "same_text" : "per_account",
      externalId: String(body.externalId || ""),
      sourceUrl: String(body.sourceUrl || ""),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "manuel batch oluşturulamadı" }, { status: 400 });
  }
}
export const POST = withUser(POSTHandler);
