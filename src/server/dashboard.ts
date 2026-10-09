import { getAccounts, getDrafts, getSummary, readAutomationLock, type DashboardSummary } from "./db";
import { aiConfigured, getAiSettings, isAiEnabled } from "./ai";
import { automationEnabled } from "./pipeline";
import { loadSources } from "./sources";
import { secretOrEnv } from "./vault";
import { currentOwnerId } from "./owner-context";
import { getXAccountAuthState } from "./x-oauth-store";
import { X_CONSENT_COPY_VERSION, X_POLICY_VERSION } from "./x-policy";

export type DashboardView = Omit<DashboardSummary, "officialPublisherConfigured"> & {
  officialPublisherConfigured: boolean;
  officialX: { connectedAccounts: number; postWriteReadyAccounts: number; autoConsentedPostAccounts: number };
  recentDrafts: { id: number; text: string; status: string }[];
};

export function getAutomationRuntime(now = Math.floor(Date.now() / 1000)) {
  const lock = readAutomationLock(now);
  const owner = lock?.owner === "worker" || lock?.owner === "web" ? lock.owner : "none";
  return {
    owner,
    heartbeatAt: owner === "none" ? null : lock!.at,
    healthy: owner !== "none",
    lagSeconds: owner === "none" ? null : now - lock!.at,
  } as const;
}

export function getDashboardSummary(): DashboardView {
  const ai = getAiSettings();
  const owner = currentOwnerId();
  const ownedAccounts = owner ? getAccounts().filter((account) => account.ownerUserId === owner) : [];
  const states = ownedAccounts.map((account) => getXAccountAuthState(account.id, owner!));
  const officialX = {
    connectedAccounts: states.filter((state) => state?.connected).length,
    postWriteReadyAccounts: states.filter((state) => state?.connected && state.scopes.includes("tweet.write")).length,
    autoConsentedPostAccounts: states.filter((state) => {
      const consent = state?.consents.find((item) => item.action === "post");
      return Boolean(state?.connected && state.scopes.includes("tweet.write") && consent?.mode === "auto"
        && consent.grantedAt !== null && consent.revokedAt === null
        && consent.policyVersion === X_POLICY_VERSION && consent.copyVersion === X_CONSENT_COPY_VERSION);
    }).length,
  };
  // Next 16 Server→Client props must be JSON-shaped; normalize native SQLite row values at this boundary.
  return JSON.parse(JSON.stringify({
    generatedAt: Math.floor(Date.now() / 1000),
    ...getSummary(loadSources().length),
    automationEnabled: automationEnabled(),
    automationRuntime: getAutomationRuntime(),
    openaiConfigured: Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
    aiEnabled: isAiEnabled(),
    aiConfigured: aiConfigured(ai),
    aiProvider: ai.provider,
    officialPublisherConfigured: Boolean(process.env.X_OAUTH_CLIENT_ID && (process.env.ISPATLA_TOKEN_KEY_CURRENT || process.env.ISPATLA_SECRET_KEY)),
    officialX,
    recentDrafts: owner ? getDrafts(3).map(({ id, text, status }) => ({ id, text, status })) : [],
  })) as DashboardView;
}
