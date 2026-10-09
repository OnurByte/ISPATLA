import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getAccounts, updateAccountSource, removeAccountSource } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  const accountId = Number(body.accountId);
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  try {
    return NextResponse.json(updateAccountSource({
      accountId, sourceHandle: handle,
      name: body.name === undefined ? undefined : String(body.name),
      enabled: body.enabled === undefined ? undefined : body.enabled === true,
      maxPosts: body.maxPosts === undefined ? undefined : Number(body.maxPosts),
      rightsStatus: body.rightsStatus === undefined ? undefined : body.rightsStatus as "cleared" | "unknown" | "prohibited",
      pinned: body.pinned === undefined ? undefined : body.pinned === true,
      niche: body.niche === undefined ? undefined : String(body.niche),
      tone: body.tone === undefined ? undefined : String(body.tone),
      topics: body.topics === undefined ? undefined : Array.isArray(body.topics) ? body.topics.map(String) : String(body.topics).split(","),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaydedilemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  const accountId = Number(new URL(request.url).searchParams.get("accountId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !getAccounts().some((account) => account.id === accountId)) return NextResponse.json({ error: "geçerli yayın hesabı gerekli" }, { status: 404 });
  removeAccountSource(accountId, handle);
  return NextResponse.json({ ok: true });
}

export const PATCH = withUser(PATCHHandler);

export const DELETE = withUser(DELETEHandler);
