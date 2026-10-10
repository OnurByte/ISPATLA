import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccountSources, removePostgresAccountSource, savePostgresAccountSource } from "@/server/postgres-sources-market";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function accountIdFor(request: Request) {
  const accountId = Number(new URL(request.url).searchParams.get("accountId"));
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null;
}

async function PATCHHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const owner = currentOwnerId()!, handle = (await context.params).handle.replace(/^@/, "").toLowerCase(), accountId = await accountIdFor(request);
  if (!accountId) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); } catch { return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 }); }
  try {
    const current = (await getPostgresAccountSources(owner, accountId)).find((source) => source.handle === handle);
    if (!current) return NextResponse.json({ error: "kaynak bu hesaba seçili değil" }, { status: 404 });
    const saved = await savePostgresAccountSource(owner, { accountId, handle,
      name: body.name === undefined ? undefined : String(body.name), enabled: body.enabled === undefined ? undefined : body.enabled === true,
      maxPosts: body.maxPosts === undefined ? undefined : Number(body.maxPosts), rightsStatus: body.rightsStatus === undefined ? undefined : body.rightsStatus as "cleared" | "unknown" | "prohibited",
      pinned: body.pinned === undefined ? undefined : body.pinned === true, niche: body.niche === undefined ? undefined : String(body.niche),
      tone: body.tone === undefined ? undefined : String(body.tone), topics: body.topics === undefined ? undefined : Array.isArray(body.topics) ? body.topics.map(String) : String(body.topics).split(","),
    });
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: "kaynak kaydedilemedi" }, { status: 500 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaydedilemedi" }, { status: 400 }); }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = await accountIdFor(request);
  if (!accountId) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  try { await removePostgresAccountSource(currentOwnerId()!, accountId, (await context.params).handle); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaldırılamadı" }, { status: 404 }); }
}

export const PATCH = withUser(PATCHHandler);
export const DELETE = withUser(DELETEHandler);
