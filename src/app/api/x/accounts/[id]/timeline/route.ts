import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getAccounts } from "@/server/db";
import { OfficialXClient } from "@/server/official-x";
import { withOfficialAccount } from "@/server/publisher";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const account = getAccounts().find((item) => item.id === id && item.enabled);
  if (!account) return NextResponse.json({ error: "aktif yayın hesabı bulunamadı" }, { status: 404 });
  try {
    const posts = await withOfficialAccount(account, (credential) => new OfficialXClient().getOwnTimeline(credential, 20));
    const items = posts.flatMap((post) => {
      const postId = typeof post.id === "string" && /^\d{1,19}$/.test(post.id) ? post.id : "";
      const text = typeof post.text === "string" ? post.text.slice(0, 10_000) : "";
      const createdAt = typeof post.created_at === "string" ? post.created_at : "";
      if (!postId || !text) return [];
      return [{ id: postId, text, createdAt, url: `https://x.com/${encodeURIComponent(account.handle)}/status/${postId}` }];
    });
    return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "X timeline alınamadı. Bağlantıyı veya okuma kapsamlarını doğrulayın." }, { status: 422 });
  }
}

export const GET = withUser(GETHandler);
