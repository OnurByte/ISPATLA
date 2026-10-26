import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { getPostgresXAccounts } from "@/server/postgres-x-oauth";
import { describeOfficialXCapabilities } from "@/server/official-x-access";

export const runtime = "nodejs";

async function GETHandler() {
  const ownerId = currentOwnerId();
  const accounts = ownerId ? (await getPostgresXAccounts(ownerId)).map((account) => {
    const scopes = account.scopes;
    const capabilityStatus = describeOfficialXCapabilities(scopes);
    const connectedStatus = account.connected;
    return {
      accountId: account.id,
      handle: account.handle,
      connected: account.connected,
      authState: account.authState,
      scopes,
      apiEnabled: capabilityStatus.apiEnabled,
      unavailableReason: capabilityStatus.unavailableReason,
      providerCapabilities: capabilityStatus.providerCapabilities,
      capabilities: {
        post: connectedStatus && capabilityStatus.capabilities.post,
        repost: connectedStatus && capabilityStatus.capabilities.repost,
        reply: connectedStatus && capabilityStatus.capabilities.reply,
        media: connectedStatus && capabilityStatus.capabilities.media,
        quote: capabilityStatus.capabilities.quote,
      },
    };
  }) : [];
  return NextResponse.json({ accounts, xEntitlement: "unknown" }, { headers: { "cache-control": "no-store" } });
}

export const GET = withUser(GETHandler);
