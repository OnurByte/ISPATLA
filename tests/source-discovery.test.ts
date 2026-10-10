import { describe, expect, test } from "bun:test";
import { extractDiscoveryEvidence, isDefinitiveMissingSourceError, mergeEvidence, nextSourceState, sourceDueForScoring, asHandle, asNiche, asTone, asTopics } from "@/server/sources";

describe("source discovery primitives", () => {
  test("normalizes configured handles and profile text", () => {
    expect(asHandle("@News_Desk")).toBe("news_desk");
    expect(asHandle("not valid!")).toBeNull();
    expect(asNiche("  teknoloji   ve   AI ")).toBe("teknoloji ve AI");
    expect(asTone("  sakin   analitik ")).toBe("sakin analitik");
    expect(asTopics(["AI", "AI", " gündem "])).toEqual(["AI", "gündem"]);
  });

  test("weights quote, reply and mention evidence without including the parent", () => {
    expect(extractDiscoveryEvidence("seed", {
      quote: { author: { screen_name: "QuotedNews" } },
      replying_to: { screen_name: "ReplyNews" },
      raw_text: { facets: [{ type: "mention", original: "@MentionedNews" }, { type: "mention", original: "@seed" }] },
    })).toEqual([
      { handle: "quotednews", weight: 3, parentHandles: ["seed"] },
      { handle: "replynews", weight: 2, parentHandles: ["seed"] },
      { handle: "mentionednews", weight: 1, parentHandles: ["seed"] },
    ]);
  });

  test("promotes only candidates with confident score and independent evidence", () => {
    const profile = mergeEvidence({ parentHandles: ["one"], evidenceWeight: 2 }, { handle: "candidate", weight: 3, parentHandles: ["two"] }, 1000);
    expect(profile.evidenceWeight).toBe(5);
    expect(profile.parentHandles).toEqual(["one", "two"]);
    expect(sourceDueForScoring(profile, 1000 + 86400)).toBe(true);
    expect(nextSourceState(profile, 20, 90).deleteReady).toBe(false);
    expect(nextSourceState({ status: "candidate", evidenceWeight: 3, parentHandles: ["one", "two"] }, 70, 70)).toMatchObject({ status: "active", enabled: true });
    expect(nextSourceState({ status: "candidate", evidenceWeight: 3, parentHandles: ["one"] }, 70, 70)).toMatchObject({ status: "candidate", enabled: false });
  });

  test("only classifies definitive missing-source errors as dead", () => {
    expect(isDefinitiveMissingSourceError(new Error("404 Not Found"))).toBe(true);
    expect(isDefinitiveMissingSourceError(new Error("network timeout"))).toBe(false);
  });
});
