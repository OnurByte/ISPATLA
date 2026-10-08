import { describe, expect, test } from "bun:test";
import { approvalExpiryLabel, canRetryJob, filterQueueItems, needsManualReview, queueDateKey } from "../src/components/queue-page";

describe("queue URL filter helpers", () => {
  test("keeps all items or matches a selected status", () => {
    const items = [{ status: "queued" }, { status: "failed" }];
    expect(filterQueueItems(items, "all")).toEqual(items);
    expect(filterQueueItems(items, "failed")).toEqual([{ status: "failed" }]);
  });

  test("groups timestamps by Istanbul calendar day", () => {
    expect(queueDateKey(Date.parse("2026-10-07T22:30:00Z") / 1000)).toBe("2026-10-08");
  });
});

describe("approval expiry and recovery UI helpers", () => {
  test("shows missing expiry honestly and limits retry to known blocked jobs", () => {
    expect(approvalExpiryLabel(null)).toBe("son kullanma zamanı API'de yok");
    expect(canRetryJob("blocked")).toBe(true);
    expect(canRetryJob("expired")).toBe(false);
    expect(canRetryJob("reconciliation_required")).toBe(false);
    expect(canRetryJob("unknown_remote_state")).toBe(false);
  });

  test("marks uncertain publication outcomes for manual review", () => {
    expect(needsManualReview("pending_reconciliation")).toBe(true);
    expect(needsManualReview("reconciliation_required")).toBe(true);
    expect(needsManualReview("unknown_remote_state")).toBe(true);
    expect(needsManualReview("expired")).toBe(false);
  });
});
