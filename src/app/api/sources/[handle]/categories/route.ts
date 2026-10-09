import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { deleteAccountSourceCategoryConfig, getAccountSourceCategoryConfigs, getAccounts, saveAccountSourceCategoryConfig } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function GETHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  const accountId = Number(new URL(request.url).searchParams.get("accountId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  return NextResponse.json(getAccountSourceCategoryConfigs(accountId).filter((item) => item.sourceHandle === handle));
}

async function PUTHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const sourceHandle = (await context.params).handle.replace(/^@/, "").toLowerCase();
    const accountId = Number(body.accountId);
    if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
    const config = saveAccountSourceCategoryConfig({
      accountId,
      sourceHandle,
      categoryId: Number(body.categoryId),
      monitoringTier: body.monitoringTier === "A" || body.monitoringTier === "B" ? body.monitoringTier : "C",
      discoveryWeight: Number(body.discoveryWeight ?? 1),
      categoryReputation: body.categoryReputation === null || body.categoryReputation === undefined ? null : Number(body.categoryReputation),
      enabled: body.enabled !== false,
      lastEvidenceAt: Number(body.lastEvidenceAt ?? Math.floor(Date.now() / 1000)),
    });
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "source category kaydedilemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const accountId = Number(url.searchParams.get("accountId"));
  const categoryId = Number(url.searchParams.get("categoryId"));
  const sourceHandle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) return NextResponse.json({ error: "geçerli kategori gerekli" }, { status: 400 });
  deleteAccountSourceCategoryConfig(accountId, sourceHandle, categoryId);
  return NextResponse.json({ ok: true });
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);

export const DELETE = withUser(DELETEHandler);
