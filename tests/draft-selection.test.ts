import { expect, test } from "bun:test";
import { selectedDraft } from "@/components/drafts-page";
import type { DraftRecord } from "@/server/db-types";

const drafts = [
  { id: 4 },
  { id: 9 },
] as DraftRecord[];

test("opens the requested draft and falls back to the newest draft", () => {
  expect(selectedDraft(drafts, 9)?.id).toBe(9);
  expect(selectedDraft(drafts, 99)?.id).toBe(4);
});
