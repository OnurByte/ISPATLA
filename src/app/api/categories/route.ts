import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresCategoriesForAccount, savePostgresAccountCategory, type PgCategory } from "@/server/postgres-accounts";

export const runtime = "nodejs";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function categoryInput(body: Record<string, unknown>, builtIn = false): Omit<PgCategory, "id" | "createdAt" | "updatedAt" | "ownerUserId" | "accountId"> {
  return {
    slug: String(body.slug || ""),
    name: String(body.name || ""),
    enabled: body.enabled !== false,
    builtIn,
    baseStrategy: String(body.baseStrategy || "generic") as PgCategory["baseStrategy"],
    clusterStrategy: String(body.clusterStrategy || "hybrid") as PgCategory["clusterStrategy"],
    verificationMode: String(body.verificationMode || "moderate") as PgCategory["verificationMode"],
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

async function GETHandler(request: Request) {
  const accountId = Number(new URL(request.url).searchParams.get("accountId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "owned accountId gerekli" }, { status: 400 });
  try { return NextResponse.json(await getPostgresCategoriesForAccount(currentOwnerId()!, accountId)); }
  catch { return NextResponse.json({ error: "hesap bulunamadı" }, { status: 404 }); }
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const accountId = Number(body.accountId);
    if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "owned accountId gerekli" }, { status: 400 });
    return NextResponse.json(await savePostgresAccountCategory(currentOwnerId()!, accountId, { ...categoryInput(body), now: Math.floor(Date.now() / 1000) }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler);
