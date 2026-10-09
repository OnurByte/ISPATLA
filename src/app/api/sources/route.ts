import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { addAccountSource, clearAccountSources, getAccountSources, getAccounts, getDeletedSources, getTechnicalSourceWarnings, isAccountSourceSelected, recordSourceEvent, updateAccountSource, upsertSource } from "@/server/db";
import { asNiche, asTone, asTopics, loadSources } from "@/server/sources";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { checkSourceLiveness, recoverTechnicalSources } from "@/server/pipeline";

export const runtime = "nodejs";

function requestedAccountId(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get("accountId");
  const id = Number(raw);
  return raw && Number.isSafeInteger(id) && id > 0 && getAccounts().some((account) => account.id === id) ? id : null;
}

function GETHandler(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  const accountId = requestedAccountId(request);
  if (!accountId) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 400 });
  const selected = getAccountSources(accountId);
  if (view === "available") {
    const selectedHandles = new Set(selected.map((source) => source.handle));
    return NextResponse.json(loadSources().filter((source) => !selectedHandles.has(source.handle)));
  }
  const selectedHandles = new Set(selected.map((source) => source.handle));
  if (view === "deleted") return NextResponse.json(getDeletedSources().filter((item) => selectedHandles.has(item.handle)));
  if (view === "warnings") return NextResponse.json(getTechnicalSourceWarnings().filter((item) => selectedHandles.has(item.handle)));
  return NextResponse.json(selected);
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const accountId = Number(body.accountId);
    if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
    if (body.action === "reset") { clearAccountSources(accountId); return NextResponse.json({ sources: [] }); }
    if (body.action === "check_liveness") return NextResponse.json(await checkSourceLiveness(Math.floor(Date.now() / 1000), body.onlyUnknown === true, getAccountSources(accountId)));
    if (body.action === "recover_technical") return NextResponse.json(await recoverTechnicalSources(Math.floor(Date.now() / 1000), getAccountSources(accountId).map((source) => source.handle)));
    const handle = String(body.handle || "").replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) return NextResponse.json({ error: "geçerli 𝕏 handle gerekli" }, { status: 400 });
    if (body.action === "select") return NextResponse.json(addAccountSource(accountId, handle));
    if (body.action === "restore_deleted") {
      if (!isAccountSourceSelected(accountId, handle)) return NextResponse.json({ error: "kaynak bu hesaba seçili değil" }, { status: 404 });
      const deleted = getTechnicalSourceWarnings(200).find((item) => item.handle === handle);
      if (!deleted || !/(?:feed )?profil kimliği (?:eşleşmedi|doğrulanamadı)/iu.test(deleted.reason)) return NextResponse.json({ error: "yalnız kimlik uyuşmazlığıyla elenen kaynaklar otomatik geri alınabilir" }, { status: 422 });
      const now = Math.floor(Date.now() / 1000);
      upsertSource({ handle, name: String(body.name || handle), enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active", pinned: true } }, now);
      const source = addAccountSource(accountId, handle);
      recordSourceEvent({ handle, event: "restored", score: deleted.score, reason: "identity mismatch auto-fix", model: "source-restore", now });
      return NextResponse.json({ ok: true, source });
    }
    const source = {
      handle,
      name: String(body.name || handle),
      enabled: body.enabled !== false,
      maxPosts: Math.min(50, Math.max(1, Number(body.maxPosts || 20))),
      rightsStatus: body.rightsStatus === "cleared" || body.rightsStatus === "prohibited" ? body.rightsStatus : "unknown",
      profile: {
        origin: "manual",
        status: "active",
        pinned: true,
        niche: asNiche(body.niche),
        tone: asTone(body.tone),
        topics: asTopics(body.topics),
      },
    } as const;
    if (!isAccountSourceSelected(accountId, handle)) upsertSource({ ...source, profile: { ...source.profile, niche: undefined, topics: undefined, tone: undefined } }, Math.floor(Date.now() / 1000));
    const selected = addAccountSource(accountId, handle);
    const saved = updateAccountSource({ accountId, sourceHandle: handle, name: source.name, enabled: source.enabled, maxPosts: source.maxPosts, rightsStatus: source.rightsStatus, niche: asNiche(body.niche), tone: asTone(body.tone), topics: asTopics(body.topics), pinned: true });
    return NextResponse.json(saved || selected, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler);
