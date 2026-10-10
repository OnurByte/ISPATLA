import { expect, mock, test } from "bun:test";

const account = { id: 7, ownerUserId: "owner-1", handle: "writer", displayName: "Writer", enabled: true };
const categoryMappings = [{ enabled: true, categorySlug: "technology" }];
let guardCalls = 0;
let evidenceInput: Record<string, unknown> | null = null;
let suggestionInput: Record<string, unknown> | null = null;
let demotionInput: Record<string, unknown> | null = null;
let confirmationInput: unknown[] | null = null;

mock.module("@/server/request-auth", () => ({ withUser: (handler: (...args: never[]) => unknown) => handler }));
mock.module("@/server/api-guard", () => ({
  guardMutation: () => { guardCalls += 1; return null; },
  readJsonBody: async (request: Request) => request.json(),
}));
mock.module("@/server/owner-context", () => ({ currentOwnerId: () => "owner-1" }));
mock.module("@/server/postgres-accounts", () => ({
  getPostgresAccount: async (owner: string, id: number) => owner === account.ownerUserId && id === account.id ? account : null,
  getPostgresCategoryConfigs: async (owner: string, id: number) => owner === account.ownerUserId && id === account.id ? categoryMappings : [],
}));
mock.module("@/server/evaluation-store", () => ({
  getAutonomyEvidence: async (scope: Record<string, unknown>) => {
    evidenceInput = scope;
    return { cleanApprovals: 32, policyFailures: 0, authFailures: 0, duplicateIncidents: 0, unacceptableOutcomes: 0,
      evidenceHash: "a".repeat(64), modelKey: "model-1", selectorVersion: "selector-1" };
  },
}));
mock.module("@/server/autonomy/evaluation", () => ({
  suggestScopedAutonomy: async (input: Record<string, unknown>) => { suggestionInput = input; return { suggested: true, suggestionId: "proposal-1", reason: "eligible" }; },
  confirmScopedAutonomy: async (...input: unknown[]) => { confirmationInput = input; return { accountId: "7", action: "post", category: "technology", riskTier: "low", modelKey: "model-1", selectorVersion: "selector-1" }; },
  demoteAutonomyAfterIncident: async (input: Record<string, unknown>) => { demotionInput = input; return true; },
}));

test("autonomy proposal and demotion routes enforce owner, enabled category, low-risk exact action scope, and mutation guard", async () => {
  guardCalls = 0;
  evidenceInput = suggestionInput = demotionInput = null;
  const proposals = await import("../src/app/api/accounts/[id]/autonomy/proposals/route");
  const demote = await import("../src/app/api/accounts/[id]/autonomy/demote/route");
  const context = { params: Promise.resolve({ id: "7" }) };
  const get = await proposals.GET(new Request("http://localhost/api/accounts/7/autonomy/proposals?action=post&category=technology"), context);
  expect(get.status).toBe(200);
  expect(await get.json()).toMatchObject({ eligible: true, cleanApprovals: 32, modelKey: "model-1", selectorVersion: "selector-1" });
  expect(evidenceInput as Record<string, unknown> | null).toEqual({ accountId: "7", action: "post", category: "technology", riskTier: "low" });

  const post = await proposals.POST(new Request("http://localhost/api/accounts/7/autonomy/proposals", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reply", category: "technology" }),
  }), context);
  expect(post.status).toBe(200);
  expect(await post.json()).toMatchObject({ suggested: true, proposalId: "proposal-1", evidenceHash: "a".repeat(64) });
  expect(suggestionInput as Record<string, unknown> | null).toMatchObject({ accountId: "7", action: "reply", category: "technology", riskTier: "low" });

  const badAction = await proposals.POST(new Request("http://localhost/api/accounts/7/autonomy/proposals", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", category: "technology" }),
  }), context);
  expect(badAction.status).toBe(400);
  categoryMappings[0]!.enabled = false;
  const disabledCategory = await demote.POST(new Request("http://localhost/api/accounts/7/autonomy/demote", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "post", category: "technology" }),
  }), context);
  expect(disabledCategory.status).toBe(400);
  categoryMappings[0]!.enabled = true;
  const demoted = await demote.POST(new Request("http://localhost/api/accounts/7/autonomy/demote", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "repost", category: "technology" }),
  }), context);
  expect(demoted.status).toBe(200);
  expect(await demoted.json()).toEqual({ demoted: true });
  expect(demotionInput as Record<string, unknown> | null).toMatchObject({ accountId: "7", action: "repost", category: "technology", riskTier: "low", reason: "user_requested" });
  expect(guardCalls).toBe(4);
});

test("confirm route requires a valid owner-bound evidence hash and uses the transaction-validated confirmation service", async () => {
  confirmationInput = null;
  const route = await import("../src/app/api/accounts/[id]/autonomy/[proposalId]/confirm/route");
  const context = { params: Promise.resolve({ id: "7", proposalId: "proposal-1" }) };
  const invalid = await route.POST(new Request("http://localhost/api/accounts/7/autonomy/proposals/proposal-1/confirm", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceHash: "bad" }),
  }), context);
  expect(invalid.status).toBe(400);
  expect(confirmationInput).toBeNull();
  const response = await route.POST(new Request("http://localhost/api/accounts/7/autonomy/proposals/proposal-1/confirm", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceHash: "a".repeat(64) }),
  }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ confirmed: true, scope: { accountId: "7", modelKey: "model-1" } });
  expect(confirmationInput as unknown[] | null).toEqual(["proposal-1", expect.any(Number), "a".repeat(64), "7"]);
});
