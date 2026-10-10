import { expect, test } from "bun:test";
import { normalizeFxPost } from "../src/server/x-reader";
import { runDueMonitors } from "../src/server/monitoring";

test("nested X metrics preserve zero separately from missing values", () => {
  const post = normalizeFxPost({
    id: "123", text: "metrics test", created_timestamp: 1749999990,
    author: { screen_name: "source", followers: 10 },
    likes: 99,
    metrics: { likes: 0, replies: 2, retweets: 3, views: 100 },
  }, "", 1750000000);
  expect(post?.metrics).toMatchObject({ likes: 0, replies: 2, reposts: 3, views: 100, quality: "partial", capturedAt: 1750000000 });
  expect(post?.metrics.quotes).toBeNull();
});

test("radar does not monitor globally selected private sources before owner-scoped PG support", async () => {
  expect(await runDueMonitors()).toEqual({ attempted: 0, failed: 0, skipped: 1 });
});
