import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccount, getPostgresCategoryConfigs } from "@/server/postgres-accounts";
import { demoteAutonomyAfterIncident } from "@/server/autonomy/evaluation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const ACTIONS = ["post", "repost", "reply"] as const;

function parseAutonomyDemotionInput(body: Record<string, unknown>) {
  const action = typeof body.action === "string" ? body.action : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  return ACTIONS.includes(action as typeof ACTIONS[number]) && category ? { action, category } : null;
}

export const POST = withUser(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const denied = guardMutation(request);
  if (denied) return denied;
  const owner = currentOwnerId()!;
  try {
    const parsed = parseAutonomyDemotionInput(await readJsonBody(request));
    if (!parsed) return NextResponse.json({ error: "Geçersiz eylem veya hesap kategorisi" }, { status: 400 });
    const id = (await context.params).id;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || String(Number(id)) !== id) return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
    const account = await getPostgresAccount(owner, Number(id));
    if (!account?.enabled) return NextResponse.json({ error: "Hesap bulunamadı" }, { status: 404 });
    if (!(await getPostgresCategoryConfigs(owner, account.id)).some((item) => item.enabled && item.categorySlug === parsed.category)) {
      return NextResponse.json({ error: "Geçersiz eylem veya hesap kategorisi" }, { status: 400 });
    }
    const demoted = await demoteAutonomyAfterIncident({ accountId: String(account.id), ...parsed, riskTier: "low", reason: "user_requested", now: Math.floor(Date.now() / 1000) });
    return NextResponse.json({ demoted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Özerklik kapatılamadı" }, { status: 400 });
  }
});
