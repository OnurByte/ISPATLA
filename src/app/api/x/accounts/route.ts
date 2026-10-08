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
    return {
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      connected: state?.connected === true,
      authState: state?.authState || "disconnected",
      scopes,
    };
  });
  return NextResponse.json({ accounts }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
