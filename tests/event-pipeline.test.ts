import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("shared radar persists immutable X observations and groups only by the existing shadow candidate key", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-event-pipeline-"));
  try {
  const result=Bun.spawnSync({cmd:[process.execPath,"-e",`
  import {expect} from "bun:test";
  import type {XPost} from "./src/server/x-reader";
  const { persistShadowObservation } = await import("./src/server/pipeline");
  const { getEventIntelligenceSnapshot, listEventAudits } = await import("./src/server/event-store");
  const post: XPost = {
    id: "111", url: "https://x.com/source/status/111", text: "Verified report https://example.test/story",
    createdAt: 90, author: { handle: "source", name: "Source", bio: "", avatarUrl: "", followers: 10, following: 2, statuses: 30, likes: 1, mediaCount: 0, verification: "not_verified" },
    metrics: { likes: null, replies: 2, reposts: null, quotes: null, views: 50, pollVotes: null, capturedAt: 100, quality: "partial" },
    media: [], sensitive: false, discovery: { quoteAuthor: "", replyTo: "", mentions: [] },
  };
  const first = persistShadowObservation(post, "legacy-cluster-1", 100);
  const second = persistShadowObservation({ ...post, id: "112", text: "Another report" }, "legacy-cluster-1", 101);
  const snapshot = getEventIntelligenceSnapshot(first.eventId);
  expect(second.eventId).toBe(first.eventId);
  expect(snapshot?.observations).toHaveLength(2);
  expect(snapshot?.observations[0].metrics.likes).toBeNull();
  expect(snapshot?.observations[0].metrics.replies).toBe(2);
  expect(snapshot?.observations[0].urls).toEqual(["https://example.test/story"]);
  expect(listEventAudits()).toEqual([]);
  `],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:join(directory,"events.sqlite3")},stdout:"pipe",stderr:"pipe"});
  expect(result.exitCode,new TextDecoder().decode(result.stderr)).toBe(0);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
