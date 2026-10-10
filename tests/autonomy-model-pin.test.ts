import { expect, test } from "bun:test";
import { confirmedAutonomyAuthorization, getAutonomyEvidence, isScopedAutonomyEnabled } from "../src/server/evaluation-store";

const scope = { accountId: "1", action: "post", category: "technology", riskTier: "low" };

test("autonomy evidence and authorization require a verified owner context", async () => {
  await expect(getAutonomyEvidence(scope)).rejects.toThrow("verified owner context");
  await expect(isScopedAutonomyEnabled(scope)).rejects.toThrow("verified owner context");
  await expect(confirmedAutonomyAuthorization(scope)).rejects.toThrow("verified owner context");
});
