import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { deleteCategory, getCategories, saveCategory, type CategoryDefinition } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

function strings(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function object(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fallback;
}

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const current = getCategories().find((category) => category.id === id);
  if (!current) return NextResponse.json({ error: "category bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request);
    return NextResponse.json(saveCategory({
      id,
      slug: String(body.slug ?? current.slug),
      name: String(body.name ?? current.name),
      enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
      builtIn: current.builtIn,
      baseStrategy: String(body.baseStrategy ?? current.baseStrategy) as CategoryDefinition["baseStrategy"],
      clusterStrategy: String(body.clusterStrategy ?? current.clusterStrategy) as CategoryDefinition["clusterStrategy"],
      verificationMode: String(body.verificationMode ?? current.verificationMode) as CategoryDefinition["verificationMode"],
      description: String(body.description ?? current.description),
      positiveExamples: strings(body.positiveExamples, current.positiveExamples),
      negativeExamples: strings(body.negativeExamples, current.negativeExamples),
      keywords: strings(body.keywords, current.keywords),
      excludedKeywords: strings(body.excludedKeywords, current.excludedKeywords),
      seedHandles: strings(body.seedHandles, current.seedHandles),
      defaultFormats: strings(body.defaultFormats, current.defaultFormats),
      sourcePolicy: object(body.sourcePolicy, current.sourcePolicy),
      riskPolicy: object(body.riskPolicy, current.riskPolicy),
      scoringPolicy: object(body.scoringPolicy, current.scoringPolicy),
      publishingPolicy: object(body.publishingPolicy, current.publishingPolicy),
      aiContext: String(body.aiContext ?? current.aiContext),
      now: Math.floor(Date.now() / 1000),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category güncellenemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  try {
    if (!deleteCategory(id)) return NextResponse.json({ error: "category bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category silinemedi" }, { status: 400 });
  }
}

export const PATCH = withUser(PATCHHandler, true);

export const DELETE = withUser(DELETEHandler, true);
