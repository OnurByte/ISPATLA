import {
  createDraft,
  createDraftBatch,
  getAccounts,
  getAccountCategoryConfigs,
  getDraft,
  getPost,
  updateDraftBatch,
  type Account,
  type AccountCategoryConfig,
  type DraftBatch,
  type DraftRecord,
} from "./db";
import { getAiSettings, isAiEnabled, resolveDraftModel, usageBudgetAllowed } from "./ai";
import {
  DRAFT_VARIANT_COUNT,
  accountCategories,
  accountCategoryConfigFor,
  baseStrategyForCategory,
  composeDraft,
  manualQualityGate,
  resolveAccountAiRoute,
  storeDraftVariants,
  type ComposeDraftResult,
} from "./pipeline";
import { evaluateDraft } from "./draft-evaluator";

export const MANUAL_DRAFT_FORMATS = ["post", "quote", "reply", "thread", "dm", "quote_comment", "thread_opener"] as const;

export type ManualDraftInput = {
  prompt?: string;
  text?: string;
  accountIds?: number[];
  format?: string;
  variantMode?: "per_account" | "same_text";
  externalId?: string;
  sourceUrl?: string;
};

function categorySlugFor(account: Account, configurations: AccountCategoryConfig[]): string {
  return configurations
    .filter((item) => item.accountId === account.id && item.enabled)
    .sort((left, right) => Number(right.primary) - Number(left.primary) || right.priority - left.priority)[0]?.categorySlug
    || accountCategories(account)[0]
    || "";
}

export async function createManualDraftBatch(input: ManualDraftInput): Promise<{ batch: DraftBatch; drafts: DraftRecord[] }> {
  const prompt = String(input.prompt || "").trim().slice(0, 6000);
  const text = String(input.text || "").trim();
  const format = (MANUAL_DRAFT_FORMATS as readonly string[]).includes(input.format || "") ? input.format! : "post";
  const variantMode = input.variantMode === "same_text" ? "same_text" : "per_account";
  const accountIds = (input.accountIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const accounts = getAccounts().filter((account) => account.enabled && (accountIds.length === 0 || accountIds.includes(account.id)));
  if (!accounts.length) throw new Error("En az bir aktif yayın hesabı seçilmeli");
  if (!prompt && !text) throw new Error("Konu/brief veya manuel metin gerekli");
  if (text && text.length > 280) throw new Error("X metni 280 karakteri geçemez");

  const sourceExternalId = String(input.externalId || "").trim();
  const sourcePost = sourceExternalId ? getPost(sourceExternalId) : null;
  const sourceUrl = String(input.sourceUrl || sourcePost?.statusUrl || "").trim();
  if (sourceUrl && !/^https:\/\/[^\s]+$/i.test(sourceUrl)) throw new Error("Kaynak URL yalnız HTTPS olabilir");
  if (format === "quote_comment" && !sourceUrl) throw new Error("quote_comment formatı için kaynak post URL'si gerekli");

  const settings = getAiSettings();
  const generations = text ? 0 : variantMode === "same_text" ? 1 : accounts.length;
  if (generations && !isAiEnabled()) throw new Error("AI kullanımı kapalı");
  const categoryConfigurations = getAccountCategoryConfigs();

  // Every generation now produces DRAFT_VARIANT_COUNT candidates, so the budget
  // check has to price the whole fan out, not one call.
  const route = generations
    ? await resolveDraftModel(resolveAccountAiRoute(accounts[0], accountCategoryConfigFor(accounts[0].id, accountCategories(accounts[0]), categoryConfigurations), "writing"))
    : { provider: settings.provider, model: settings.model, reason: "manual" };
  if (generations && !usageBudgetAllowed(route.provider, route.model, generations * DRAFT_VARIANT_COUNT)) {
    throw new Error("AI aylık yerel bütçe limiti bu üretimi karşılamıyor");
  }

  const now = Math.floor(Date.now() / 1000);
  const batch = createDraftBatch({
    prompt: prompt || text,
    format,
    variantMode,
    accountIds: accounts.map((account) => account.id),
    provider: text ? "manual" : route.provider,
    model: text ? "manual" : route.model,
    now,
  });

  const composed: Array<ComposeDraftResult | null> = [];
  const generatedTexts: string[] = [];
  if (text) {
    generatedTexts.push(text);
    composed.push(null);
  } else {
    const targets = variantMode === "same_text" ? [accounts[0]] : accounts;
    for (const account of targets) {
      const categorySlug = categorySlugFor(account, categoryConfigurations);
      const accountRoute = await resolveDraftModel(
        resolveAccountAiRoute(account, accountCategoryConfigFor(account.id, accountCategories(account), categoryConfigurations), "writing"),
      );
      const result = await composeDraft({
        account,
        format,
        prompt,
        sourceUrl,
        sourceText: sourcePost?.text || "",
        sourceHandle: sourcePost?.sourceHandle || "",
        categorySlug,
        baseStrategy: baseStrategyForCategory(categorySlug),
        aiRoute: { provider: accountRoute.provider, model: accountRoute.model },
        now,
      });
      if ("reason" in result) {
        updateDraftBatch(batch.id, "failed", Math.floor(Date.now() / 1000));
        throw new Error(variantMode === "same_text" ? result.reason : `@${account.handle}: ${result.reason}`);
      }
      generatedTexts.push(result.text);
      composed.push(result);
    }
  }

  const drafts: DraftRecord[] = [];
  for (const [index, account] of accounts.entries()) {
    const slot = variantMode === "same_text" || text ? 0 : index;
    const draftText = generatedTexts[slot];
    const selection = composed[slot];
    const gateReason = manualQualityGate(draftText, sourcePost?.text || "", sourceUrl);
    const stored = createDraft({
      batchId: batch.id,
      origin: "manual",
      prompt: prompt || text,
      provider: text ? "manual" : route.provider,
      model: text ? "manual" : route.model,
      variantMode,
      externalId: sourceExternalId,
      accountId: account.id,
      format,
      text: draftText,
      status: gateReason ? "blocked" : "ready",
      gateReason: gateReason || "quality gate geçti",
      sourceHandle: sourcePost?.sourceHandle || "",
      sourceUrl,
      sourceScore: sourcePost?.score || 0,
      now: Math.floor(Date.now() / 1000),
    });
    if (selection) storeDraftVariants(stored.id, selection.variants, Math.floor(Date.now() / 1000));
    const categorySlug = categorySlugFor(account, categoryConfigurations);
    await evaluateDraft({
      draftId: stored.id,
      text: stored.text,
      account,
      categorySlug,
      format: stored.format,
      mediaType: "none",
      sourceText: sourcePost?.text || "",
    }).catch(() => undefined);
    drafts.push(getDraft(stored.id) || stored);
  }
  const status = drafts.some((draft) => draft.status === "blocked") ? "needs_review" : "ready";
  return { batch: updateDraftBatch(batch.id, status, Math.floor(Date.now() / 1000)) || { ...batch, status }, drafts };
}
