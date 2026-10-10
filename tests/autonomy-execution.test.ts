import { expect, test } from "bun:test";
import { authorizeAutomaticSend, demoteAutomaticExecution } from "../src/server/autonomy/execution";
import { decideXPolicy } from "../src/server/x-policy";

test("automatic send and demotion require an owner context before reading persisted state", async () => {
  await expect(authorizeAutomaticSend({ draftId: 1, accountId: 1, action: "post" }))
    .rejects.toThrow("automatic send owner and identifiers are required");
  await expect(demoteAutomaticExecution({ draftId: 1, accountId: 1, action: "post", reason: "policy_failure", now: 1 }))
    .rejects.toThrow("automatic send owner and identifiers are required");
});

test("human approved manual assist remains available without automatic authorization", () => {
  expect(decideXPolicy({
    action: "post", automatic: false, mode: "assist", accountId: 1, now: 30,
    text: "human approved", grantConnected: true, capabilities: ["post"], humanApproved: true, history: [],
  }).allowed).toBe(true);
});
