import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";
import { clearPostgresAccountSources, getPostgresAccountSources, savePostgresAccountSource } from "@/server/postgres-sources-market";
import { asNiche, asTone, asTopics, loadSourceCatalog } from "@/server/source-catalog";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function requestedAccountId(request: Request): Promise<number | null> {
  const raw = new URL(request.url).searchParams.get("accountId"), id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id < 1) return null;
  return (await getPostgresAccounts(currentOwnerId()!)).some((account) => account.id === id) ? id : null;
}

async function GETHandler(request: Request) {
  const view = new URL(request.url).searchParams.get("view"), accountId = await requestedAccountId(request);
  if (!accountId) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 400 });
  const selected = await getPostgresAccountSources(currentOwnerId()!, accountId);
  const selectedHandles = new Set(selected.map((source) => source.handle));
  if (view === "available") return NextResponse.json(loadSourceCatalog().filter((source) => !selectedHandles.has(source.handle)));
  // Historical liveness and deletion events still belong to the unported scan worker.
  if (view === "deleted" || view === "warnings") return NextResponse.json([]);
  return NextResponse.json(selected);
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request), accountId = Number(body.accountId), owner = currentOwnerId()!;
    if (!Number.isSafeInteger(accountId) || accountId < 1 || !(await getPostgresAccounts(owner)).some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
    if (body.action === "reset") { await clearPostgresAccountSources(owner, accountId); return NextResponse.json({ sources: [] }); }
    if (body.action === "check_liveness" || body.action === "recover_technical" || body.action === "restore_deleted") {
      return NextResponse.json({ error: "kaynak tarama worker'ı henüz PostgreSQL'e taşınmadı" }, { status: 503 });
    }
    const handle = String(body.handle || "").replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) return NextResponse.json({ error: "geçerli 𝕏 handle gerekli" }, { status: 400 });
    return NextResponse.json(await savePostgresAccountSource(owner, { accountId, handle,
      name: String(body.name || handle).slice(0, 120), enabled: body.enabled !== false,
      maxPosts: Math.min(50, Math.max(1, Number(body.maxPosts || 20))),
      rightsStatus: body.rightsStatus === "cleared" || body.rightsStatus === "prohibited" ? body.rightsStatus : "unknown",
      niche: asNiche(body.niche), tone: asTone(body.tone), topics: asTopics(body.topics), pinned: true,
    }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
