import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccount, updatePostgresAccount } from "@/server/postgres-accounts";
import { buildVoiceProfile, fetchVoiceProfile, voiceProfileSummary } from "@/server/voice-profile";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const account = await getPostgresAccount(currentOwnerId()!, Number((await context.params).id));
  if (!account) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  return NextResponse.json({ handle: account.handle, voice: (account.styleProfile as Record<string, unknown>).voice ?? null });
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const owner = currentOwnerId()!;
  const account = await getPostgresAccount(owner, Number((await context.params).id));
  if (!account) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);
    const handle = String(body.handle || account.handle).replace(/^@/, "");
    const supplied = Array.isArray(body.posts) ? body.posts as Array<{ text: string }> : null;
    const profile = supplied
      ? buildVoiceProfile(supplied, { handle })
      : await fetchVoiceProfile({ handle, maxPosts: Number(body.maxPosts) || 60 });
    const saved = await updatePostgresAccount({ ...account, owner, styleProfile: { ...account.styleProfile, voice: profile } });
    if (!saved) return NextResponse.json({ error: "voice profili kaydedilemedi" }, { status: 500 });
    return NextResponse.json({ handle: profile.handle, summary: voiceProfileSummary(profile), voiceContract: profile.voiceContract }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "voice profili oluşturulamadı" }, { status: 424 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
