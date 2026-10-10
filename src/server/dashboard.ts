import type { DashboardSummary } from "./db-types";
import { currentOwnerId } from "./owner-context";
import { getPostgresDashboardSummary } from "./postgres-profile-dashboard";
import { getPostgresXAccounts } from "./postgres-x-oauth";

export type DashboardView = Omit<DashboardSummary, "officialPublisherConfigured"> & {
  officialPublisherConfigured: boolean;
  officialX: { connectedAccounts: number; postWriteReadyAccounts: number; autoConsentedPostAccounts: number };
  recentDrafts: { id: number; text: string; status: string }[];
  historicalAnalyticsAvailable: boolean;
};

export function getAutomationRuntime() {
  return { owner: "none", heartbeatAt: null, healthy: false, lagSeconds: null } as const;
}

export async function getDashboardSummary(): Promise<DashboardView> {
  const owner = currentOwnerId();
  if (!owner) throw new Error("authenticated dashboard owner required");
  const [summary, accounts] = await Promise.all([getPostgresDashboardSummary(), getPostgresXAccounts(owner)]);
  const connected = accounts.filter((account) => account.enabled && account.connected);
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    ...summary,
    automationEnabled: false,
    automationRuntime: getAutomationRuntime(),
    openaiConfigured: false,
    aiEnabled: false,
    aiConfigured: false,
    aiProvider: "api",
    officialPublisherConfigured: Boolean(process.env.X_OAUTH_CLIENT_ID && (process.env.ISPATLA_TOKEN_KEY_CURRENT || process.env.ISPATLA_SECRET_KEY)),
    officialX: {
      connectedAccounts: connected.length,
      postWriteReadyAccounts: connected.filter((account) => account.scopes.includes("tweet.write")).length,
      autoConsentedPostAccounts: 0,
    },
    recentDrafts: [],
    historicalAnalyticsAvailable: false,
  };
}
