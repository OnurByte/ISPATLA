import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { NextResponse } from "next/server";
import { getOwnAccountInference, runAccountCategoryInference } from "@/server/account-inference";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accountId = Number((await context.params).id);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
  try {
    return NextResponse.json(await getOwnAccountInference(accountId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return error instanceof Error && error.message === "owned X account not found"
      ? NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 })
      : NextResponse.json({ error: "Hesap analizi şu anda kullanılamıyor" }, { status: 503 });
  }
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = Number((await context.params).id);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request).catch(() => ({} as Record<string, unknown>));
    return NextResponse.json(await runAccountCategoryInference({ accountId, regenerate: body.regenerate === true }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hesap analizi tamamlanamadı" }, { status: 422 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
