import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getAccounts } from "@/server/db";
import { guardMutation } from "@/server/api-guard";
import { OfficialXClient } from "@/server/official-x";
import { withOfficialAccount } from "@/server/publisher";

export const runtime = "nodejs";

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const account = getAccounts().find((item) => item.id === id && item.enabled);
  if (!account) return NextResponse.json({ error: "aktif yayın hesabı bulunamadı" }, { status: 404 });
  try {
    const timeline = await withOfficialAccount(account, (credential) => new OfficialXClient().getOwnTimeline(credential, 5));
    return NextResponse.json({ ok: true, connection: { connected: true, handle: account.handle, timelineReadable: true, observedPosts: timeline.length } });
  } catch {
    return NextResponse.json({ error: "X bağlantısı doğrulanamadı. Hesabı yeniden bağlayın." }, { status: 422 });
  }
}

export const POST = withUser(POSTHandler);
