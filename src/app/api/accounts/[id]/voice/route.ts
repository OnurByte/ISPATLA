import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getAccounts, getAccountVoiceProfile, saveAccountVoiceProfile } from "@/server/db";
import { buildVoiceProfile, fetchVoiceProfile, voiceProfileSummary } from "@/server/voice-profile";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const account = getAccounts().find((item) => item.id === Number(id));
  if (!account) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  return NextResponse.json({ handle: account.handle, voice: getAccountVoiceProfile(account.id) });
}

/**
 * Rebuilds the account's voice profile from its own public timeline and stores
 * it additively under styleProfile.voice. `posts` may be supplied instead of a
 * live read; that path is how tests and offline replays work.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const { id } = await context.params;
  const account = getAccounts().find((item) => item.id === Number(id));
  if (!account) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);
    const handle = String(body.handle || account.handle).replace(/^@/, "");
    const supplied = Array.isArray(body.posts) ? body.posts as Array<{ text: string }> : null;
    const profile = supplied
      ? buildVoiceProfile(supplied, { handle })
      : await fetchVoiceProfile({ handle, maxPosts: Number(body.maxPosts) || 60 });
    const saved = saveAccountVoiceProfile(account.id, profile as unknown as Record<string, unknown>, Math.floor(Date.now() / 1000));
    if (!saved) return NextResponse.json({ error: "voice profili kaydedilemedi" }, { status: 500 });
    return NextResponse.json({ handle: profile.handle, summary: voiceProfileSummary(profile), voiceContract: profile.voiceContract }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "voice profili oluşturulamadı" }, { status: 424 });
  }
}
