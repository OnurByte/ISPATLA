import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { linkPublicAccount } from "@/server/account-link";
import { readJsonBody, guardMutation } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresAccounts } from "@/server/postgres-accounts";

export const runtime = "nodejs";

async function GETHandler() {
  const accounts = (await getPostgresAccounts(currentOwnerId()!)).map((account) => publicAccount(account));
  return NextResponse.json(accounts, { headers: { "cache-control": "no-store" } });
}

function publicAccount(account: Awaited<ReturnType<typeof getPostgresAccounts>>[number]) {
  return {
    id: account.id,
    xUserId: account.xUserId,
    ownershipVerifiedAt: account.ownershipVerifiedAt,
    accountKey: account.accountKey,
    handle: account.handle,
    displayName: account.displayName,
    enabled: account.enabled,
    defaultAccount: account.defaultAccount,
    dailyLimit: account.dailyLimit,
    capabilities: account.capabilities,
    styleProfile: account.styleProfile,
    publicVerificationStatus: account.publicVerificationStatus,
    updatedAt: account.updatedAt,
  };
}

async function POSTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const result = await linkPublicAccount(body.handle);
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Hesap bulunamadı veya profil kaynağına erişilemiyor." }, { status: 424 }); }
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler);
