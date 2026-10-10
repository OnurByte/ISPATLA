import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { listPolicyKillAudit, listPolicyKillControls, setPolicyKillControl, type KillScope } from "@/server/policy-store";

export const runtime = "nodejs";

export const GET = withUser(async () => {
  const [controls, audit] = await Promise.all([listPolicyKillControls(), listPolicyKillAudit()]);
  return NextResponse.json({ controls, audit }, { headers: { "cache-control": "no-store" } });
});

export const POST = withUser(async (request: Request) => {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); }
  catch { return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 }); }
  try {
    if (!( ["global", "account", "category", "action"] as unknown[]).includes(body.scope)
      || typeof body.enabled !== "boolean" || !Number.isSafeInteger(body.expectedVersion)
      || typeof body.reason !== "string") return NextResponse.json({ error: "politika kontrolü geçersiz" }, { status: 400 });
    const control = await setPolicyKillControl({ scope: body.scope as KillScope, value: body.value as string | number | undefined,
      enabled: body.enabled, expectedVersion: body.expectedVersion as number, reason: body.reason });
    return NextResponse.json({ control });
  } catch (error) {
    const message = error instanceof Error ? error.message : "policy control update failed";
    return NextResponse.json({ error: message }, { status: message.includes("version conflict") ? 409 : 400 });
  }
});
