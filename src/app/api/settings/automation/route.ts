import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { AUTOMATION_TASK_IDS, getAccounts, getAutomationLogs, getAutomationSchedules, saveAutomationSchedule, setSetting } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getAutomationRuntime } from "@/server/dashboard";
import { currentOwnerId } from "@/server/owner-context";
import { getXAccountAuthState } from "@/server/x-oauth-store";

export const runtime = "nodejs";

function GETHandler() {
  const owner = currentOwnerId();
  const operator = Boolean(owner && owner === process.env.ISPATLA_OPERATOR_USER_ID);
  const accountAutomation = getAccounts().filter((account) => account.ownerUserId === owner).map((account) => {
    const state = getXAccountAuthState(account.id, owner!);
    return { accountId: account.id, handle: account.handle, displayName: account.displayName, enabled: account.enabled, connected: Boolean(state?.connected), postMode: state?.consents.find((consent) => consent.action === "post")?.mode || "off" };
  });
  return NextResponse.json({ runtime: getAutomationRuntime(), operator, accountAutomation,
    schedules: operator ? getAutomationSchedules() : [], logs: operator ? getAutomationLogs(100) : [] }, { headers: { "Cache-Control": "no-store" } });
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  if (body.action === "update_schedule") {
    const id = String(body.task || "");
    if (!AUTOMATION_TASK_IDS.includes(id as (typeof AUTOMATION_TASK_IDS)[number])) return NextResponse.json({ error: "bilinmeyen otomasyon görevi" }, { status: 400 });
    try {
      const schedule = saveAutomationSchedule({ id: id as (typeof AUTOMATION_TASK_IDS)[number], enabled: body.enabled !== false, intervalSeconds: Number(body.intervalSeconds), nextRunAt: Number(body.nextRunAt), now: Math.floor(Date.now() / 1000) });
      return NextResponse.json({ schedule, schedules: getAutomationSchedules(), logs: getAutomationLogs(100) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "schedule kaydedilemedi" }, { status: 400 });
    }
  }
  const paused = body.paused === true;
  setSetting("automation_paused", paused ? "1" : "0", Math.floor(Date.now() / 1000));
  return NextResponse.json({ paused });
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler, true);
