import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccount, getPostgresCategoryConfigs } from "@/server/postgres-accounts";
import { getAutonomyEvidence } from "@/server/evaluation-store";
import { suggestScopedAutonomy } from "@/server/autonomy/evaluation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const ACTIONS = ["post", "repost", "reply"] as const;

function parseAutonomyProposalInput(body: Record<string, unknown>) {
  const action = typeof body.action === "string" ? body.action : "";
  const category = typeof body.category === "string" ? body.category : "";
  return ACTIONS.includes(action as typeof ACTIONS[number]) && category.trim()
    ? { action, category: category.trim() }
    : null;
}

async function readScope(owner: string, id: string, action: string, category: string) {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || String(Number(id)) !== id) return null;
  const account = await getPostgresAccount(owner, Number(id));
  if (!account?.enabled) return null;
  const mappings = await getPostgresCategoryConfigs(owner, account.id);
  if (!mappings.some((item) => item.enabled && item.categorySlug === category)) return null;
  return { account, scope: { accountId: String(account.id), action, category, riskTier: "low" } as const };
}

async function GETHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = currentOwnerId()!;
  const url = new URL(request.url);
  const parsed = parseAutonomyProposalInput({ action: url.searchParams.get("action"), category: url.searchParams.get("category") });
  if (!parsed) return NextResponse.json({ error: "Geçersiz eylem veya hesap kategorisi" }, { status: 400 });
  try {
    const resolved = await readScope(owner, (await context.params).id, parsed.action, parsed.category);
    if (!resolved) return NextResponse.json({ error: "Hesap veya etkin kategori bulunamadı" }, { status: 404 });
    const evidence = await getAutonomyEvidence(resolved.scope);
    const eligible = evidence.modelKey !== null && evidence.selectorVersion !== null && evidence.cleanApprovals >= 30
      && evidence.policyFailures === 0 && evidence.authFailures === 0 && evidence.duplicateIncidents === 0 && evidence.unacceptableOutcomes === 0;
    return NextResponse.json({ scope: resolved.scope, ...evidence, eligible,
      reason: eligible ? "eligible" : evidence.policyFailures || evidence.authFailures || evidence.duplicateIncidents || evidence.unacceptableOutcomes ? "incident" : "insufficient_history" },
      { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Özerklik kanıtı şu anda alınamıyor" }, { status: 503 });
  }
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const owner = currentOwnerId()!;
  try {
    const parsed = parseAutonomyProposalInput(await readJsonBody(request));
    if (!parsed) return NextResponse.json({ error: "Geçersiz eylem veya hesap kategorisi" }, { status: 400 });
    const resolved = await readScope(owner, (await context.params).id, parsed.action, parsed.category);
    if (!resolved) return NextResponse.json({ error: "Hesap veya etkin kategori bulunamadı" }, { status: 404 });
    const scope = resolved.scope;
    const result = await suggestScopedAutonomy({ ...scope, createdAt: Math.floor(Date.now() / 1000) });
    if (!result.suggested || !result.suggestionId) return NextResponse.json({ suggested: false, reason: result.reason });
    const evidence = await getAutonomyEvidence(scope);
    return NextResponse.json({ suggested: true, proposalId: result.suggestionId, scope,
      modelKey: evidence.modelKey, selectorVersion: evidence.selectorVersion, evidenceHash: evidence.evidenceHash,
      cleanApprovals: evidence.cleanApprovals });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Özerklik önerisi oluşturulamadı" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
