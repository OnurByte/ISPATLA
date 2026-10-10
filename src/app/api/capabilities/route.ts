import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { getPostgresXAccounts } from "@/server/postgres-x-oauth";

export const runtime = "nodejs";

async function GETHandler() {
  const ownerId = currentOwnerId();
  const accounts = ownerId ? (await getPostgresXAccounts(ownerId)).map((account) => {
    const scopes = account.scopes;
    const write = account.connected && scopes.includes("tweet.write");
    return {
      accountId: account.id,
      handle: account.handle,
      connected: account.connected,
      authState: account.authState,
      scopes,
      capabilities: {
        post: write,
        repost: write,
        reply: write,
        media: account.connected && scopes.includes("media.write"),
        quote: "unknown",
      },
    };
  }) : [];
  return NextResponse.json({ accounts, xEntitlement: "unknown" }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
