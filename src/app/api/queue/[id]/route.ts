import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getPostgresQueueJob, updatePostgresQueueJob } from "@/server/postgres-queue-store";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "geçersiz job id" }, { status: 400 });
  const current = await getPostgresQueueJob(id);
  if (!current) return NextResponse.json({ error: "job bulunamadı" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  if (body.status !== "queued" && body.status !== "cancelled") {
    return NextResponse.json({ error: "status queued veya cancelled olmalı" }, { status: 400 });
  }
  const status = body.status;
  if (status === "queued" && !["post", "repost", "reply"].includes(current.action)) {
    return NextResponse.json({ error: "Bu eylem kuyruğa alınamaz." }, { status: 422 });
  }
  const job = await updatePostgresQueueJob({ id, status, reason: status === "cancelled" ? "kullanıcı iptal etti" : undefined, now: Math.floor(Date.now() / 1000) });
  return job ? NextResponse.json(job) : NextResponse.json({ error: "job durumu değişti veya işlem artık güvenli değil" }, { status: 409 });
}

export const PATCH = withUser(PATCHHandler);
