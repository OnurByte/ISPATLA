import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { deletePostgresAccountCategory, getPostgresCategory, savePostgresAccountCategory, type PgCategory } from "@/server/postgres-accounts";

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
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); } catch { return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 }); }
  const accountId = Number(body.accountId);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "owned accountId gerekli" }, { status: 400 });
  let current: PgCategory | null;
  try { current = await getPostgresCategory(currentOwnerId()!, accountId, id); } catch { return NextResponse.json({ error: "category bulunamadı" }, { status: 404 }); }
  if (!current) return NextResponse.json({ error: "category bulunamadı" }, { status: 404 });
  const operator = Boolean(currentOwnerId() && currentOwnerId() === process.env.ISPATLA_OPERATOR_USER_ID);
  if (current.builtIn) return NextResponse.json({ error: operator ? "hazır kategori düzenleme PostgreSQL sürümünde henüz kullanılamıyor" : "hazır kategoriler salt okunur" }, { status: operator ? 503 : 403 });
  try {
    const updated = {
      id,
      slug: String(body.slug ?? current.slug),
      name: String(body.name ?? current.name),
      enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
      builtIn: current.builtIn,
      baseStrategy: String(body.baseStrategy ?? current.baseStrategy) as PgCategory["baseStrategy"],
      clusterStrategy: String(body.clusterStrategy ?? current.clusterStrategy) as PgCategory["clusterStrategy"],
      verificationMode: String(body.verificationMode ?? current.verificationMode) as PgCategory["verificationMode"],
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
      ownerUserId: current.ownerUserId,
      accountId: current.accountId,
      now: Math.floor(Date.now() / 1000),
    } as Omit<PgCategory, "createdAt" | "updatedAt" | "ownerUserId" | "accountId"> & { id: number; now: number };
    return NextResponse.json(await savePostgresAccountCategory(currentOwnerId()!, accountId, updated));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category güncellenemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  try {
    if (!await deletePostgresAccountCategory(currentOwnerId()!, id)) return NextResponse.json({ error: "category bulunamadı" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "category silinemedi" }, { status: 400 });
  }
}

export const PATCH = withUser(PATCHHandler);

export const DELETE = withUser(DELETEHandler);
