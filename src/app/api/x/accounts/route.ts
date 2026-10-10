import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { getPostgresOwnUserProfileXUserId, getPostgresXAccounts } from "@/server/postgres-x-oauth";

export const runtime = "nodejs";

async function GETHandler() {
  const ownerId = currentOwnerId();
  if (!ownerId) return NextResponse.json({ accounts: [] }, { headers: { "cache-control": "no-store" } });
  const [profileXUserId, accounts] = await Promise.all([
    getPostgresOwnUserProfileXUserId(ownerId), getPostgresXAccounts(ownerId),
  ]);
  return NextResponse.json({ accounts: accounts.map((account) => ({
    id: account.id, handle: account.handle, displayName: account.displayName, connected: account.connected,
    matchesProfile: account.enabled && account.connected && account.xUserId === profileXUserId,
    authState: account.authState, scopes: account.scopes,
  })) }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
