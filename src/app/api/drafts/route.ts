import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { createDraft, getAccountCategoryConfigs, getDraft, getDrafts, getPost, getAccounts, getStoredSources } from "@/server/db";
import { accountCategories, baseStrategyForCategory, composeDraft, qualityGate, storeDraftVariants } from "@/server/pipeline";
import { evaluateDraft } from "@/server/draft-evaluator";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { ensureDraftRevisionStore } from "@/server/draft-revisions";

export const runtime = "nodejs";

function GETHandler() {
  ensureDraftRevisionStore();
  return NextResponse.json(getDrafts());
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    ensureDraftRevisionStore();
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
    let generated: Awaited<ReturnType<typeof composeDraft>> | null = null;
    if (!text && post) {
      const categorySlug = account
        ? getAccountCategoryConfigs()
          .filter((item) => item.accountId === account.id && item.enabled)
          .sort((left, right) => Number(right.primary) - Number(left.primary) || right.priority - left.priority)[0]?.categorySlug
          || accountCategories(account)[0]
          || ""
        : "";
      generated = await composeDraft({
        post, account, source, format,
        instruction: typeof body.instruction === "string" ? body.instruction : "",
        categorySlug,
        baseStrategy: baseStrategyForCategory(categorySlug),
      });
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
    if (generated && "variants" in generated) storeDraftVariants(draft.id, generated.variants, now);
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

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler);
