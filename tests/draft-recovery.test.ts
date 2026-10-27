import { expect, test } from "bun:test";
import { readDraftRecovery, retainDraftRecovery } from "@/lib/draft-recovery";
test("navigation recovery keeps unsaved editor and composer text isolated by owner and source context", () => {
  const pending = { form: { text: "My unsaved editor text" }, prompt: "My AI brief", manualText: "My own manual text" };
  retainDraftRecovery("local-owner-a", "default", pending);
  expect(readDraftRecovery<typeof pending>("local-owner-a", "default")).toEqual(pending);
  expect(readDraftRecovery("local-owner-b", "default")).toBeUndefined();
  expect(readDraftRecovery("local-owner-a", "reply:123")).toBeUndefined();
  retainDraftRecovery("local-owner-a", "default", null);
  expect(readDraftRecovery("local-owner-a", "default")).toBeUndefined();
  retainDraftRecovery("", "default", pending);
  expect(readDraftRecovery("", "default")).toBeUndefined();
});
