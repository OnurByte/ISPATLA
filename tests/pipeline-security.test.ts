import { describe, expect, test } from "bun:test";
import { isAllowedMediaUrl, safeStatusUrl } from "@/server/security";
import { draftCategoryFacet, writingContractFor } from "@/server/draft-contracts";

describe("pipeline security primitives", () => {
  test("accepts only the exact media hosts over HTTPS", () => {
    expect(isAllowedMediaUrl("https://pbs.twimg.com/media/a.jpg", "photo")).toBe(true);
    expect(isAllowedMediaUrl("https://pbs.twimg.com.evil.example/a.jpg", "photo")).toBe(false);
    expect(isAllowedMediaUrl("http://pbs.twimg.com/media/a.jpg", "photo")).toBe(false);
    expect(isAllowedMediaUrl("https://video.twimg.com/a.mp4", "video")).toBe(true);
    expect(isAllowedMediaUrl("https://pbs.twimg.com/a.mp4", "video")).toBe(false);
  });

  test("rebuilds unsafe status URLs from trusted handle and numeric id", () => {
    expect(safeStatusUrl("javascript:alert(1)", "trusted", "123")).toBe("https://x.com/trusted/status/123");
    expect(safeStatusUrl("https://evil.example/user/status/123", "trusted", "x")).toBe("https://x.com/trusted/status/0");
    expect(safeStatusUrl("https://twitter.com/user/status/123?tracking=1", "trusted", "123")).toBe("https://twitter.com/user/status/123");
  });

  test("keeps category safety constraints in the draft contract", () => {
    const facet = draftCategoryFacet(writingContractFor("finance"), "finance");
    expect(facet).toContain("yatırım tavsiyesi verme");
    expect(facet).toContain("al/sat iması");
  });
});
