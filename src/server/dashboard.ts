import type { DashboardSummary } from "./db-types";
import { currentOwnerId } from "./owner-context";
import { getPostgresDashboardSummary } from "./postgres-profile-dashboard";
import { getPostgresAccounts } from "./postgres-accounts";
import { getPostgresDrafts } from "./postgres-drafts";
import { getPostgresSetting } from "./postgres-settings";
import { getAiSettings, isAiEnabled, aiConfigured } from "./ai";

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
  const [summary, accounts, recentDrafts, settings, enabled, automation] = await Promise.all([getPostgresDashboardSummary(), getPostgresAccounts(owner), getPostgresDrafts(6), getAiSettings(), isAiEnabled(), getPostgresSetting("automation_enabled", "0")]);
  const configured = await aiConfigured(settings);
  const connected = accounts.filter((account) => account.enabled);
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    ...summary,
    automationEnabled: automation === "1",
    automationRuntime: getAutomationRuntime(),
    openaiConfigured: settings.provider === "api" && configured,
    aiEnabled: enabled,
    aiConfigured: configured,
    aiProvider: settings.provider === "openrouter" ? "compatible" : settings.provider,
    officialPublisherConfigured: false,
    officialX: {
      connectedAccounts: connected.length,
      postWriteReadyAccounts: 0,
      autoConsentedPostAccounts: 0,
    },
    recentDrafts: recentDrafts.map(({ id, text, status }) => ({ id, text, status })),
    historicalAnalyticsAvailable: false,
  };
}
