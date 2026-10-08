import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getSourceCategoryConfigs, saveSourceCategoryConfig } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  return NextResponse.json(getSourceCategoryConfigs(handle));
}

async function PUTHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const sourceHandle = (await context.params).handle.replace(/^@/, "").toLowerCase();
    const config = saveSourceCategoryConfig({
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

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler, true);
