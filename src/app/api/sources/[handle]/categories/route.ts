import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/server/owner-context";
import { deletePostgresSourceCategoryConfig, getPostgresSourceCategoryConfigs, savePostgresSourceCategoryConfig } from "@/server/postgres-sources-market";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function GETHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const accountId = Number(new URL(request.url).searchParams.get("accountId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 400 });
  try { return NextResponse.json(await getPostgresSourceCategoryConfigs(currentOwnerId()!, accountId, (await context.params).handle)); }
  catch { return NextResponse.json({ error: "hesap bulunamadı" }, { status: 404 }); }
}

async function PUTHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request), result = await savePostgresSourceCategoryConfig(currentOwnerId()!, {
      accountId: Number(body.accountId), sourceHandle: (await context.params).handle,
      categoryId: Number(body.categoryId), monitoringTier: body.monitoringTier === "A" || body.monitoringTier === "B" ? body.monitoringTier : "C",
      discoveryWeight: Number(body.discoveryWeight ?? 1), categoryReputation: body.categoryReputation === null || body.categoryReputation === undefined ? null : Number(body.categoryReputation),
      enabled: body.enabled !== false, lastEvidenceAt: Number(body.lastEvidenceAt ?? Math.floor(Date.now() / 1000)),
    });
    return result ? NextResponse.json(result) : NextResponse.json({ error: "source category kaydedilemedi" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "source category kaydedilemedi" }, { status: 400 }); }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const url = new URL(request.url), accountId = Number(url.searchParams.get("accountId")), categoryId = Number(url.searchParams.get("categoryId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 400 });
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) return NextResponse.json({ error: "geçerli kategori gerekli" }, { status: 400 });
  try { await deletePostgresSourceCategoryConfig(currentOwnerId()!, accountId, (await context.params).handle, categoryId); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "hesap bulunamadı" }, { status: 404 }); }
}

export const GET = withUser(GETHandler);
export const PUT = withUser(PUTHandler);
export const DELETE = withUser(DELETEHandler);
