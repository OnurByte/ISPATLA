import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getCategories, saveCategory, type CategoryDefinition } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function categoryInput(body: Record<string, unknown>, builtIn = false): Omit<CategoryDefinition, "id" | "createdAt" | "updatedAt"> {
  return {
    slug: String(body.slug || ""),
    name: String(body.name || ""),
    enabled: body.enabled !== false,
    builtIn,
    baseStrategy: String(body.baseStrategy || "generic") as CategoryDefinition["baseStrategy"],
    clusterStrategy: String(body.clusterStrategy || "hybrid") as CategoryDefinition["clusterStrategy"],
    verificationMode: String(body.verificationMode || "moderate") as CategoryDefinition["verificationMode"],
    description: String(body.description || ""),
    positiveExamples: strings(body.positiveExamples),
    negativeExamples: strings(body.negativeExamples),
    keywords: strings(body.keywords),
    excludedKeywords: strings(body.excludedKeywords),
    seedHandles: strings(body.seedHandles),
    defaultFormats: strings(body.defaultFormats),
    sourcePolicy: object(body.sourcePolicy),
    riskPolicy: object(body.riskPolicy),
    scoringPolicy: object(body.scoringPolicy),
    publishingPolicy: object(body.publishingPolicy),
    aiContext: String(body.aiContext || ""),
  };
}

function GETHandler() {
  return NextResponse.json(getCategories());
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    return NextResponse.json(saveCategory({ ...categoryInput(body), now: Math.floor(Date.now() / 1000) }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler, true);
