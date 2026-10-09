import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { getAccounts, getOwnUserProfileXUserId } from "@/server/db";
import { getXAccountAuthState } from "@/server/x-oauth";

export const runtime = "nodejs";

function GETHandler() {
  const ownerId = currentOwnerId();
  const profileXUserId = ownerId ? getOwnUserProfileXUserId() : null;
  const accounts = getAccounts().map((account) => {
    const state = ownerId ? getXAccountAuthState(account.id, ownerId) : null;
    const scopes = state?.scopes || [];
    return {
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      connected: state?.connected === true,
      matchesProfile: account.enabled && state?.connected === true && state.xUserId === profileXUserId,
      authState: state?.authState || "disconnected",
      scopes,
    };
  });
  return NextResponse.json({ accounts }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
