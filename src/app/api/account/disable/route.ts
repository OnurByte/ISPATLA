import { withUser } from "@/server/request-auth";
import { disableAuthenticatedUser, requireSession } from "@/server/auth";
import { guardMutation } from "@/server/api-guard";
import { disconnectChatGPT } from "@/server/chatgpt-connection";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const createdAt = new Date(session.session.createdAt).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 5 * 60 * 1000) {
    return NextResponse.json({ error: "Hesabı devre dışı bırakmak için yeniden giriş yap." }, { status: 403 });
  }
  try {
    try { await disconnectChatGPT(); } catch { /* Local disable still takes effect if remote revocation is unavailable. */ }
    await disableAuthenticatedUser(session.user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Hesap devre dışı bırakılamadı." }, { status: 503 });
  }
}

export const POST = withUser(POSTHandler);
