import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { runAutomationJob } from "@/server/queue-service";
import { guardMutation } from "@/server/api-guard";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  try {
    const result = await runAutomationJob(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "job çalıştırılamadı";
    return NextResponse.json({ error: message }, { status: message.includes("bulunamadı") ? 404 : 422 });
  }
}

export const POST = withUser(POSTHandler);
