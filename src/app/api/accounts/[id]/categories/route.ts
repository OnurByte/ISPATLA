import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresCategoryConfigs, savePostgresCategoryConfig } from "@/server/postgres-accounts";
import { acceptAccountCategoryInference, normalizeCategoryInferenceSelection } from "@/server/account-inference";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accountId = Number((await context.params).id);
  try { return NextResponse.json(await getPostgresCategoryConfigs(currentOwnerId()!, accountId)); }
  catch { return NextResponse.json({ error: "account bulunamadı" }, { status: 404 }); }
}

async function PUTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = Number((await context.params).id);
  try {
    const body = await readJsonBody(request);
    const categoryId = Number(body.categoryId);
    return NextResponse.json(await savePostgresCategoryConfig(currentOwnerId()!, {
      accountId,
      categoryId,
      enabled: body.enabled !== false,
      primary: body.primary === true,
      weight: Number(body.weight ?? 1),
      priority: Number(body.priority ?? 0),
      publishThreshold: body.publishThreshold === null || body.publishThreshold === undefined ? null : Number(body.publishThreshold),
      dailyBudget: body.dailyBudget === null || body.dailyBudget === undefined ? null : Number(body.dailyBudget),
      styleOverride: object(body.styleOverride),
      aiRouteOverride: object(body.aiRouteOverride),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "account category kaydedilemedi" }, { status: 400 });
  }
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = Number((await context.params).id);
  try {
    const body = await readJsonBody(request);
    if (!Number.isSafeInteger(accountId) || accountId < 1) {
      return NextResponse.json({ error: "Kategori seçimi geçersiz" }, { status: 400 });
    }
    const selection = normalizeCategoryInferenceSelection(body.categoryIds, body.weights);
    const accepted = await acceptAccountCategoryInference({ accountId, ...selection, now: Math.floor(Date.now() / 1000) });
    return NextResponse.json(accepted);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Öneriler kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);

export const POST = withUser(POSTHandler);
