import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { getAccounts } from "@/server/db";
import { getXAccountAuthState } from "@/server/x-oauth";

export const runtime = "nodejs";

function GETHandler() {
  const ownerId = currentOwnerId();
  const accounts = getAccounts().map((account) => {
    const state = ownerId ? getXAccountAuthState(account.id, ownerId) : null;
    const scopes = state?.scopes || [];
    const write = state?.connected === true && scopes.includes("tweet.write");
    return {
      accountId: account.id,
      handle: account.handle,
      connected: state?.connected === true,
      authState: state?.authState || "disconnected",
      scopes,
      capabilities: {
        post: write,
        repost: write,
        reply: write,
        media: state?.connected === true && scopes.includes("media.write"),
        quote: "unknown",
      },
    };
  });
  return NextResponse.json({ accounts, xEntitlement: "unknown" }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
