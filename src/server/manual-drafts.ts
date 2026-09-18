import {
  createDraft,
  createDraftBatch,
  getAccounts,
  getAccountCategoryConfigs,
  getDraft,
  getPost,
  updateDraftBatch,
  type DraftBatch,
  type DraftRecord,
} from "./db";
import { getAiSettings, isAiEnabled, usageBudgetAllowed } from "./ai";
import { accountCategories, generateManualDraft, manualQualityGate } from "./pipeline";
import { evaluateDraft } from "./draft-evaluator";

export type ManualDraftInput = {
  prompt?: string;
  text?: string;
  accountIds?: number[];
  format?: string;
  variantMode?: "per_account" | "same_text";
  externalId?: string;
  sourceUrl?: string;
};

export async function createManualDraftBatch(input: ManualDraftInput): Promise<{ batch: DraftBatch; drafts: DraftRecord[] }> {
  const prompt = String(input.prompt || "").trim().slice(0, 6000);
  const text = String(input.text || "").trim();
  const format = ["post", "quote", "reply", "thread", "dm"].includes(input.format || "") ? input.format! : "post";
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

  const settings = getAiSettings();
  const calls = text ? 0 : variantMode === "same_text" ? 1 : accounts.length;
  if (calls && !isAiEnabled()) throw new Error("AI kullanımı kapalı");
  if (calls && !usageBudgetAllowed(settings.provider, settings.model, calls)) throw new Error("AI aylık yerel bütçe limiti bu üretimi karşılamıyor");
  const now = Math.floor(Date.now() / 1000);
  const batch = createDraftBatch({
    prompt: prompt || text,
    format,
    variantMode,
    accountIds: accounts.map((account) => account.id),
    provider: text ? "manual" : settings.provider,
    model: text ? "manual" : settings.model,
    now,
  });

  const generatedTexts: string[] = [];
  if (text) generatedTexts.push(text);
  else if (variantMode === "same_text") {
    const generated = await generateManualDraft({ prompt, account: accounts[0], format, sourceUrl });
    if (!("text" in generated)) {
      updateDraftBatch(batch.id, "failed", Math.floor(Date.now() / 1000));
      throw new Error(generated.reason);
    }
    generatedTexts.push(generated.text);
  } else {
    for (const account of accounts) {
      const generated = await generateManualDraft({ prompt, account, format, sourceUrl });
      if (!("text" in generated)) {
        updateDraftBatch(batch.id, "failed", Math.floor(Date.now() / 1000));
        throw new Error(`@${account.handle}: ${generated.reason}`);
      }
      generatedTexts.push(generated.text);
    }
  }

  const categoryConfigurations = getAccountCategoryConfigs();
  const drafts: DraftRecord[] = [];
  for (const [index, account] of accounts.entries()) {
    const draftText = generatedTexts[variantMode === "same_text" ? 0 : index];
    const gateReason = manualQualityGate(draftText, sourcePost?.text || "", sourceUrl);
    const stored = createDraft({
      batchId: batch.id,
      origin: "manual",
      prompt: prompt || text,
      provider: text ? "manual" : settings.provider,
      model: text ? "manual" : settings.model,
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
    const categorySlug = categoryConfigurations
      .filter((item) => item.accountId === account.id && item.enabled)
      .sort((left, right) => Number(right.primary) - Number(left.primary) || right.priority - left.priority)[0]?.categorySlug
      || accountCategories(account)[0]
      || "";
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
