import { describe, expect, test } from "bun:test";
import { approvalExpiryLabel, canCreateFreshApproval, needsManualReview } from "../src/components/queue-page";

describe("approval expiry UI", () => {
  test("offers a fresh approval only after the server marks the old one expired", () => {
    expect(canCreateFreshApproval("expired")).toBe(true);
    expect(canCreateFreshApproval("pending_approval")).toBe(false);
    expect(canCreateFreshApproval("approved")).toBe(false);
    expect(canCreateFreshApproval("reconciliation_required")).toBe(false);
  });

  test("keeps uncertain writes in manual review and formats expiry evidence", () => {
    expect(needsManualReview("unknown_remote_state")).toBe(true);
    expect(needsManualReview("reconciliation_required")).toBe(true);
    expect(approvalExpiryLabel(1_791_476_400)).not.toBe("son kullanma zamanı API'de yok");
    expect(approvalExpiryLabel(null)).toBe("son kullanma zamanı API'de yok");
  });
});
