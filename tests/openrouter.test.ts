import { expect, test } from "bun:test";
import { getArenaRankings, parseArenaRows, resetArenaCacheForTests } from "@/server/arena-rankings";
import { AI_PROVIDERS } from "@/server/ai";
import { jevConfigured, jevMode } from "@/server/jev";

test("OpenRouter remains a supported provider and Jev stays opt-in", () => {
  expect(AI_PROVIDERS).toContain("openrouter");
  expect(jevMode()).toBe("off");
  expect(jevConfigured()).toBe(false);
});

test("Arena parser rejects malformed rows and rankings validate, order, and cache", async () => {
  expect(parseArenaRows({ rows: [{ row: { rank: "first", model_name: "bad" } }] }).available).toBe(false);
  resetArenaCacheForTests();
  let calls = 0;
  const result = await getArenaRankings(async (url) => {
    calls++;
    expect(String(url)).toContain("dataset=lmarena-ai%2Fleaderboard-dataset");
    return Response.json({ rows: [
      { row: { rank: 2, model_name: "org/model-two", organization: "org", rating: 1400.25, vote_count: 200, category: "overall", leaderboard_publish_date: "2026-10-08" } },
      { row: { rank: 1, model_name: "org/model-one", organization: "org", rating: 1500, vote_count: 300, category: "overall", leaderboard_publish_date: "2026-10-08" } },
      { row: { rank: 1, model_name: "not-overall", organization: "org", rating: 1500, vote_count: 300, category: "coding", leaderboard_publish_date: "2026-10-08" } },
    ] });
  });
  expect(result.models.map((model) => model.name)).toEqual(["org/model-one", "org/model-two"]);
  expect(result.models[0]?.rating).toBe(1500);
  expect((await getArenaRankings(async () => { calls++; throw new Error("should be cached"); })).available).toBe(true);
  expect(calls).toBe(1);
  resetArenaCacheForTests();
});
