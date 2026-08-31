import { NextResponse } from "next/server";
import { createJob, getAccounts, getDraft, getPost, updateDraft } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { qualityGate } from "@/server/pipeline";
import { createIntentForDraft } from "@/server/publication-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const draft = getDraft(id);
  if (!draft) return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const accountId = body.accountId === undefined ? draft.accountId : body.accountId === null ? null : Number(body.accountId);
  const account = getAccounts().find((item) => item.id === accountId && item.enabled);
  if (!accountId || !account) {
    return NextResponse.json({ error: "aktif bir yayın hesabı seçilmeli" }, { status: 422 });
  }
  const action = String(body.action || draft.format || "post");
  if (!["post", "like", "retweet", "reply"].includes(draft.format) || action !== draft.format) {
    return NextResponse.json({ error: "x-use queue yalnız post, like, repost ve reply çalıştırır" }, { status: 422 });
  }
  const post = draft.externalId ? getPost(draft.externalId) : null;
  const gateReason = action === "post" ? (post ? qualityGate(post, draft.text) : null) : action === "reply" && !draft.text.trim() ? "reply metni boş olamaz" : !draft.sourceUrl ? "hedef X post URL gerekli" : null;
  if (gateReason) {
    updateDraft({ id, accountId, status: "blocked", gateReason, now: Math.floor(Date.now() / 1000) });
    return NextResponse.json({ error: gateReason }, { status: 422 });
  }
  if (!account.xuseAccountId) return NextResponse.json({ error: "hesabın x-use account id eşlemesi yok" }, { status: 422 });
  const now = Math.floor(Date.now() / 1000);
  if (action === "post") return NextResponse.json(createIntentForDraft(id, accountId, now), { status: 201 });
  const job = createJob({
    draftId: id,
    accountId,
    action,
    scheduledAt: body.scheduledAt ? Number(body.scheduledAt) : now,
    now,
  });
  updateDraft({ id, accountId, status: "queued", now });
  return NextResponse.json(job, { status: 201 });
}
