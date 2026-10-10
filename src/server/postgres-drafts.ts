import { and, desc, eq, inArray, max } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { accounts, draftEvaluations, draftRevisions, drafts } from "./postgres-schema";

export type PgDraft = {
  id: number; batchId: string; origin: string; prompt: string; provider: string; model: string; variantMode: string;
  sourceHandle: string; sourceUrl: string; externalId: string; accountId: number | null; accountHandle: string;
  format: string; text: string; status: string; gateReason: string; score: number; evaluation: {
    score: number; confidence: number; predictedResidual: number | null; predictedViews: number | null;
    baseline: { scope: "account_category_format" | "account_format" | "account" | "none"; samples: number; medianViews: number | null; medianReplies: number | null };
    helped: string[]; hurt: string[];
  } | null; createdAt: number; updatedAt: number;
};
export type PgDraftRevision = { id: number; draftId: number; revision: number; accountId: number | null; format: string; text: string; externalId: string; sourceHandle: string; sourceUrl: string; createdAt: number };

function owner() { const id = currentOwnerId(); if (!id) throw new Error("Oturum gerekli"); return id; }
function parseList(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}
function view(row: typeof drafts.$inferSelect, handle?: string | null, evaluation?: typeof draftEvaluations.$inferSelect): PgDraft {
  return { ...row, accountHandle: handle || "atanmamış", score: row.sourceScore, evaluation: evaluation ? {
    score: evaluation.score, confidence: evaluation.confidence, predictedResidual: evaluation.predictedResidual, predictedViews: evaluation.predictedViews,
    baseline: { scope: evaluation.baselineScope as "account_category_format" | "account_format" | "account" | "none",
      samples: evaluation.baselineSamples, medianViews: evaluation.baselineViews, medianReplies: evaluation.baselineReplies },
    helped: parseList(evaluation.helpedJson), hurt: parseList(evaluation.hurtJson),
  } : null };
}
async function attachEvaluations(rows: Array<{ draft: typeof drafts.$inferSelect; handle: string | null }>): Promise<PgDraft[]> {
  if (!rows.length) return [];
  const evaluations = await getPostgresDb().select().from(draftEvaluations).where(inArray(draftEvaluations.draftId, rows.map(({ draft }) => draft.id)));
  const byDraft = new Map(evaluations.map((evaluation) => [evaluation.draftId, evaluation]));
  return rows.map(({ draft, handle }) => view(draft, handle, byDraft.get(draft.id)));
}

export async function getPostgresDrafts(limit = 100): Promise<PgDraft[]> {
  const current = owner();
  const rows = await getPostgresDb().select({ draft: drafts, handle: accounts.handle }).from(drafts)
    .leftJoin(accounts, and(eq(accounts.id, drafts.accountId), eq(accounts.ownerUserId, current)))
    .where(eq(drafts.ownerUserId, current)).orderBy(desc(drafts.updatedAt), desc(drafts.id)).limit(Math.max(1, Math.min(200, limit)));
  return attachEvaluations(rows);
}

export async function getPostgresDraft(id: number): Promise<PgDraft | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const current = owner();
  const [row] = await getPostgresDb().select({ draft: drafts, handle: accounts.handle }).from(drafts)
    .leftJoin(accounts, and(eq(accounts.id, drafts.accountId), eq(accounts.ownerUserId, current)))
    .where(and(eq(drafts.id, id), eq(drafts.ownerUserId, current))).limit(1);
  return row ? (await attachEvaluations([row]))[0] : null;
}

export async function savePostgresDraft(input: { id?: number; externalId?: string; accountId?: number | null; format?: string; text?: string; sourceHandle?: string; sourceUrl?: string }): Promise<PgDraft | null> {
  const current = owner(), db = getPostgresDb(), now = Math.floor(Date.now() / 1000);
  const format = String(input.format ?? "post").trim(), text = String(input.text ?? "").trim();
  if (!format || format.length > 32 || text.length > 10000) throw new Error("draft alanları geçersiz");
  if (input.accountId !== undefined && input.accountId !== null) {
    if (!Number.isSafeInteger(input.accountId) || input.accountId < 1 || !(await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.ownerUserId, current))).limit(1)).length) throw new Error("account bulunamadı");
  }
  return db.transaction(async (tx) => {
    if (input.id === undefined) {
      const [row] = await tx.insert(drafts).values({ ownerUserId: current, externalId: input.externalId ?? "", accountId: input.accountId ?? null, format,
        text, status: "draft", gateReason: "", sourceHandle: input.sourceHandle ?? "", sourceUrl: input.sourceUrl ?? "", createdAt: now, updatedAt: now }).returning();
      await tx.insert(draftRevisions).values({ draftId: row.id, ownerUserId: current, revision: 1, accountId: row.accountId, format: row.format, text: row.text,
        externalId: row.externalId, sourceHandle: row.sourceHandle, sourceUrl: row.sourceUrl, createdAt: now });
      return view(row);
    }
    const [before] = await tx.select().from(drafts).where(and(eq(drafts.id, input.id), eq(drafts.ownerUserId, current))).limit(1);
    if (!before) return null;
    const changes = { accountId: input.accountId === undefined ? before.accountId : input.accountId, format, text,
      status: before.status, gateReason: before.gateReason,
      sourceHandle: input.sourceHandle ?? before.sourceHandle, sourceUrl: input.sourceUrl ?? before.sourceUrl, updatedAt: now };
    const contentChanged = changes.accountId !== before.accountId || changes.format !== before.format || changes.text !== before.text || changes.sourceHandle !== before.sourceHandle || changes.sourceUrl !== before.sourceUrl;
    const [row] = await tx.update(drafts).set({ ...changes, ...(contentChanged ? { status: "draft", gateReason: "" } : {}) })
      .where(and(eq(drafts.id, input.id), eq(drafts.ownerUserId, current))).returning();
    if (contentChanged) {
      const [latest] = await tx.select({ revision: max(draftRevisions.revision) }).from(draftRevisions).where(and(eq(draftRevisions.draftId, row.id), eq(draftRevisions.ownerUserId, current)));
      await tx.insert(draftRevisions).values({ draftId: row.id, ownerUserId: current, revision: Number(latest.revision ?? 0) + 1,
        accountId: row.accountId, format: row.format, text: row.text, externalId: row.externalId, sourceHandle: row.sourceHandle, sourceUrl: row.sourceUrl, createdAt: now });
    }
    const [account] = row.accountId === null ? [] : await tx.select({ handle: accounts.handle }).from(accounts).where(and(eq(accounts.id, row.accountId), eq(accounts.ownerUserId, current))).limit(1);
    return view(row, account?.handle);
  });
}

export async function setPostgresDraftDecision(input: { id: number; status: "ready" | "blocked"; gateReason: string }): Promise<PgDraft | null> {
  const current = owner(), db = getPostgresDb();
  const [row] = await db.update(drafts).set({ status: input.status, gateReason: input.gateReason, updatedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(drafts.id, input.id), eq(drafts.ownerUserId, current), inArray(drafts.status, ["draft", "needs_review", "blocked", "ready"]))).returning();
  if (!row) return null;
  const [account] = row.accountId === null ? [] : await db.select({ handle: accounts.handle }).from(accounts)
    .where(and(eq(accounts.id, row.accountId), eq(accounts.ownerUserId, current))).limit(1);
  return view(row, account?.handle);
}

export async function deletePostgresDraft(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id < 1) return false;
  const current = owner();
  const deleted = await getPostgresDb().delete(drafts).where(and(eq(drafts.id, id), eq(drafts.ownerUserId, current))).returning({ id: drafts.id });
  return deleted.length > 0;
}

export async function getPostgresDraftRevisions(id: number): Promise<PgDraftRevision[]> {
  if (!Number.isSafeInteger(id) || id < 1) return [];
  const current = owner();
  return getPostgresDb().select({ id: draftRevisions.id, draftId: draftRevisions.draftId, revision: draftRevisions.revision, accountId: draftRevisions.accountId,
    format: draftRevisions.format, text: draftRevisions.text, externalId: draftRevisions.externalId, sourceHandle: draftRevisions.sourceHandle,
    sourceUrl: draftRevisions.sourceUrl, createdAt: draftRevisions.createdAt }).from(draftRevisions)
    .where(and(eq(draftRevisions.draftId, id), eq(draftRevisions.ownerUserId, current))).orderBy(desc(draftRevisions.revision));
}
