import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { testAiConnection } from "@/server/ai";
import { guardMutation } from "@/server/api-guard";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await testAiConnection());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (detail.includes("request cost is unknown")) {
      return NextResponse.json({ ok: false, error: "unknown_cost_under_budget" }, { status: 409 });
    }
    if (detail.includes("budget") || detail.includes("bütçe")) {
      return NextResponse.json({ ok: false, error: "budget_limit" }, { status: 429 });
    }
    if (detail.includes("does not support")) {
      return NextResponse.json({ ok: false, error: "unsupported_model_or_task" }, { status: 400 });
    }
    if (detail.includes("unavailable")) {
      return NextResponse.json({ ok: false, error: "provider_unavailable" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "connection_test_failed" }, { status: 502 });
  }
}

export const POST = withUser(POSTHandler);
