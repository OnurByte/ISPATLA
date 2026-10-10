import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getPostgresAiBudgetStatus, getPostgresSetting, getPostgresUsageSummary } from "@/server/postgres-settings";

export const runtime = "nodejs";

async function GETHandler() {
  const now = new Date();
  const since = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const [provider, model, enabled, summary, budget] = await Promise.all([
    getPostgresSetting("ai_provider", "api"), getPostgresSetting("ai_model", ""), getPostgresSetting("ai_enabled", "1"),
    getPostgresUsageSummary(since), getPostgresAiBudgetStatus(),
  ]);
  return NextResponse.json({ enabled: enabled !== "0", provider, model, summary, monthlyBudgetUsd: budget.monthlyBudgetUsd, budget,
    runtimeAvailable: false, creditPolicy: { post: 15, quote: 25, reply: 25, dm: 25, thread: 100 } });
}

export const GET = withUser(GETHandler);
