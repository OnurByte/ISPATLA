import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getAutomationRuntime } from "@/server/dashboard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresXAccounts } from "@/server/postgres-x-oauth";
import { AUTOMATION_TASK_IDS, getPostgresAutomationLogs, getPostgresAutomationSchedules, savePostgresAutomationSchedule, setPostgresSetting } from "@/server/postgres-settings";

export const runtime = "nodejs";

async function GETHandler() {
  const owner = currentOwnerId();
  const operator = Boolean(owner && owner === process.env.ISPATLA_OPERATOR_USER_ID);
  const accountAutomation = owner ? (await getPostgresXAccounts(owner)).map((account) => ({
    accountId: account.id, handle: account.handle, displayName: account.displayName,
    enabled: account.enabled, connected: account.connected, postMode: account.postMode,
  })) : [];
  return NextResponse.json({ runtime: getAutomationRuntime(), operator, accountAutomation,
    schedules: operator ? await getPostgresAutomationSchedules() : [], logs: operator ? await getPostgresAutomationLogs(100) : [] }, { headers: { "Cache-Control": "no-store" } });
}

async function POSTHandler(request: Request) {
  const owner = currentOwnerId();
  if (!owner || owner !== process.env.ISPATLA_OPERATOR_USER_ID) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
      const schedule = await savePostgresAutomationSchedule({ id: id as (typeof AUTOMATION_TASK_IDS)[number], enabled: body.enabled !== false, intervalSeconds: Number(body.intervalSeconds), nextRunAt: Number(body.nextRunAt), now: Math.floor(Date.now() / 1000) });
      return NextResponse.json({ schedule, schedules: await getPostgresAutomationSchedules(), logs: await getPostgresAutomationLogs(100) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "schedule kaydedilemedi" }, { status: 400 });
    }
  }
  if (body.action !== "set_paused" || typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "action update_schedule veya boolean paused ile set_paused olmalı" }, { status: 400 });
  }
  const paused = body.paused;
  await setPostgresSetting("automation_paused", paused ? "1" : "0");
  return NextResponse.json({ paused });
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler, true);
