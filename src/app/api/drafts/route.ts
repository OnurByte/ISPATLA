import { NextResponse } from "next/server";
import { createDraft, getAccountCategoryConfigs, getDraft, getDrafts, getPost, getAccounts, getStoredSources } from "@/server/db";
import { accountCategories, accountMatchesSource, generateDraft, qualityGate } from "@/server/pipeline";
import { evaluateDraft } from "@/server/draft-evaluator";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getDrafts());
}

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const externalId = String(body.externalId || "");
    const post = externalId ? getPost(externalId) : null;
    const accountId = Number(body.accountId || 0);
    const account = getAccounts().find((item) => item.id === accountId);
    const source = post ? getStoredSources().find((item) => item.handle === post.sourceHandle) : undefined;
    let text = String(body.text || "").trim();
    const format = String(body.format || "post");
    let status = "draft";
    let gateReason = "";
    if (!text && post) {
      if (account && source && !accountMatchesSource(account, source)) {
        return NextResponse.json({ error: "seçilen hesap, kaynak tandansı ile eşleşmiyor" }, { status: 422 });
      }
      const style = account ? JSON.stringify(account.styleProfile) : "sade, kanıt odaklı";
      const generated = await generateDraft(post, { format, style, instruction: typeof body.instruction === "string" ? body.instruction : "", account, source });
      if (!("text" in generated)) return NextResponse.json({ error: generated.reason }, { status: 422 });
      text = generated.text;
      gateReason = format === "post" ? qualityGate(post, text) || "quality gate geçti" : "format için manuel kontrol bekliyor";
      status = gateReason.includes("gate geçti") || gateReason.includes("manuel") ? "ready" : "blocked";
    }
    if (!text) return NextResponse.json({ error: "text veya geçerli externalId gerekli" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const draft = createDraft({
      externalId,
      accountId: account?.id || null,
      format,
      text,
      status,
      gateReason,
      now,
    });
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
        sourceText: post?.text || "",
        now,
      }).catch(() => undefined);
    }
    return NextResponse.json(getDraft(draft.id) || draft, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "draft oluşturulamadı" }, { status: 400 });
  }
}
