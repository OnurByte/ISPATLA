import { expect, test } from "bun:test";

test("PostgreSQL dashboard uses real history and settings projection and owner-scoped X accounts", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from "bun:test";
    import { runAsOwner } from "./src/server/owner-context.ts";
    mock.module("./src/server/postgres-profile-dashboard.ts", () => ({ getPostgresDashboardSummary: async () => ({
      dbAvailable:true, sourcesConfigured:0, sourcesObserved:0, postsObserved:7, postsLast24h:0, opportunities:0,
      attemptsPending:0, publishedConfirmed:0, publishBlocked:0, recentPosts:[], activity:[], lastRun:null,
    }) }));
    mock.module("./src/server/postgres-accounts.ts", () => ({ getPostgresAccounts: async (owner) => {
      if (owner !== "dashboard-owner") throw new Error("owner scope lost");
      return [
        { id:1, enabled:true, connected:true, scopes:["users.read", "tweet.write"] },
        { id:2, enabled:false, connected:true, scopes:["tweet.write"] },
      ];
    } }));
    mock.module("./src/server/postgres-drafts.ts", () => ({ getPostgresDrafts: async () => [{ id:4, text:"owned draft", status:"ready" }] }));
    mock.module("./src/server/postgres-settings.ts", () => ({ getPostgresSetting: async () => "1" }));
    mock.module("./src/server/ai.ts", () => ({ getAiSettings: async () => ({ provider:"api", model:"test" }), isAiEnabled: async () => true, aiConfigured: async () => true }));
    const { getDashboardSummary } = await import("./src/server/dashboard.ts");
    const summary = await runAsOwner("dashboard-owner", () => getDashboardSummary());
    if (!summary.dbAvailable || summary.historicalAnalyticsAvailable || summary.postsObserved !== 7 || summary.officialX.connectedAccounts !== 1 || summary.officialX.postWriteReadyAccounts !== 0 || summary.recentDrafts.length !== 1 || !summary.aiConfigured || !summary.automationEnabled || summary.officialPublisherConfigured) throw new Error("PostgreSQL dashboard projection failed");
    console.log("PostgreSQL dashboard projection verified");
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toContain("PostgreSQL dashboard projection verified");
}, 30_000);
