import { AccountsPage, type AccountPageData } from "@/components/accounts-page";
import { PageHeading } from "@/components/page-heading";
import { getAccounts, getCategories } from "@/server/db";
import { currentOwnerId } from "@/server/owner-context";
import { renderUserPage } from "@/server/page-auth";
import { getXAccountAuthState } from "@/server/x-oauth";
import { X_CONSENT_COPY_VERSION, X_POLICY_VERSION } from "@/server/x-policy";
import type { XConnectionState } from "@/components/x-connection-controls";

export const dynamic = "force-dynamic";

function safeConnectionState(accountId: number, ownerId: string): XConnectionState {
  const state = getXAccountAuthState(accountId, ownerId);
  if (!state) return null;
  return {
    connected: state.connected,
    handle: state.handle,
    authState: state.authState,
    connectedAt: state.connectedAt,
    lastHealthAt: state.lastHealthAt,
    lastAuthError: state.lastAuthError,
    expiresAt: state.expiresAt,
    scopes: state.scopes,
    refreshedAt: state.refreshedAt,
    tokenVersion: state.tokenVersion,
    consents: state.consents.map((consent) => ({
      ...consent,
      mode: consent.mode === "manual" ? "assist" : consent.mode === "shadow" ? "observe" : consent.mode,
    })),
  };
}

export default async function AccountsRoute({ searchParams }: {
  searchParams: Promise<{ connection?: string; accountId?: string }>;
}) {
  const query = await searchParams;
  return renderUserPage(() => {
    const accounts = getAccounts().map((account): AccountPageData => ({
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
    }));
    const ownerId = currentOwnerId();
    const connections = Object.fromEntries(accounts.map((account) => [account.id,
      ownerId ? safeConnectionState(account.id, ownerId) : null,
    ]));
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Operasyon / hesaplar" title="𝕏 hesapları ve yayın sınırları" description="𝕏 bağlantılarını ve her hesabın editoryal tercihlerini tek yerde yönetin." /><AccountsPage initial={accounts} categories={getCategories()} connections={connections} policyVersion={X_POLICY_VERSION} copyVersion={X_CONSENT_COPY_VERSION} connectionResult={query.connection} connectionAccountId={query.accountId ? Number(query.accountId) : undefined} /></div></main>;
  });
}
