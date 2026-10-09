import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { acceptAccountCategoryInference, getAccountCategoryConfigs, saveAccountCategoryConfig } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accountId = Number((await context.params).id);
  return NextResponse.json(getAccountCategoryConfigs(accountId));
}

async function PUTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = Number((await context.params).id);
  try {
    const body = await readJsonBody(request);
    const categoryId = Number(body.categoryId);
    return NextResponse.json(saveAccountCategoryConfig({
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
    if (!Array.isArray(body.categoryIds) || body.categoryIds.some((value) => !Number.isSafeInteger(value) || Number(value) < 1)) {
      return NextResponse.json({ error: "Kategori seçimi geçersiz" }, { status: 400 });
    }
    const weights = object(body.weights);
    return NextResponse.json(acceptAccountCategoryInference({ accountId, categoryIds: body.categoryIds.map(Number),
      weights: Object.fromEntries(Object.entries(weights).map(([id, weight]) => [id, Number(weight)])), now: Math.floor(Date.now() / 1000) }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Öneriler kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);

export const POST = withUser(POSTHandler);
