import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import type { Account } from "@/server/db";
import { getAccounts } from "@/server/db";
import { guardMutation } from "@/server/api-guard";

export const runtime = "nodejs";

function GETHandler() {
  const accounts = getAccounts().map((account) => publicAccount(account));
  return NextResponse.json(accounts, { headers: { "cache-control": "no-store" } });
}

function publicAccount(account: Account) {
  return {
    id: account.id,
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
  return NextResponse.json({ error: "Yayın hesabı yalnızca doğrulanmış X OAuth bağlantısıyla oluşturulabilir." }, { status: 422 });
}

export const GET = withUser(GETHandler);

export const POST = withUser(POSTHandler);
