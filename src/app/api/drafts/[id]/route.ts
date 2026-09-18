import { NextResponse } from "next/server";
import { deleteDraft, getAccountCategoryConfigs, getAccounts, getDraft, getPost, updateDraft } from "@/server/db";
import { accountCategories } from "@/server/pipeline";
import { evaluateDraft } from "@/server/draft-evaluator";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!getDraft(id)) return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  const draft = updateDraft({
    id,
    accountId: body.accountId === null ? null : body.accountId === undefined ? undefined : Number(body.accountId),
    format: body.format === undefined ? undefined : String(body.format),
    text: body.text === undefined ? undefined : String(body.text),
    status: body.status === undefined ? undefined : String(body.status),
    gateReason: body.gateReason === undefined ? undefined : String(body.gateReason),
    now,
  });
  if (draft?.accountId) {
    const account = getAccounts().find((item) => item.id === draft.accountId);
    if (account) {
      const categorySlug = getAccountCategoryConfigs()
        .filter((item) => item.accountId === account.id && item.enabled)
        .sort((left, right) => Number(right.primary) - Number(left.primary) || right.priority - left.priority)[0]?.categorySlug
        || accountCategories(account)[0]
        || "";
      await evaluateDraft({
        draftId: draft.id,
        text: draft.text,
        account,
        categorySlug,
        format: draft.format,
        mediaType: "none",
        sourceText: draft.externalId ? getPost(draft.externalId)?.text || "" : "",
        now,
      }).catch(() => undefined);
    }
  }
  return NextResponse.json(getDraft(id) || draft);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!deleteDraft(id)) return NextResponse.json({ error: "draft bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
