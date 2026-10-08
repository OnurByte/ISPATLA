import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getAiSettings, isAiEnabled } from "@/server/ai";
import { getAiBudgetStatus, getUsageSummary } from "@/server/db";

export const runtime = "nodejs";

function GETHandler() {
  const now = new Date();
  const since = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const settings = getAiSettings();
  const budget = getAiBudgetStatus();
  return NextResponse.json({ enabled: isAiEnabled(), provider: settings.provider, model: settings.model, summary: getUsageSummary(since), monthlyBudgetUsd: budget.monthlyBudgetUsd, budget, creditPolicy: { post: 15, quote: 25, reply: 25, dm: 25, thread: 100 } });
}

export const GET = withUser(GETHandler);
