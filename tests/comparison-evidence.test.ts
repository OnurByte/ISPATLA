import { describe, expect, test } from "bun:test";
import { complaintEvidence, evidence, evidenceStates } from "@/content/comparisons/evidence";

describe("public competitor evidence", () => {
  test("every comparison claim has a dated HTTPS source and recognized evidence state", () => {
    expect(evidence.length).toBeGreaterThan(8);
    for (const item of evidence) {
      expect(evidenceStates).toContain(item.state);
      expect(item.sourceUrl.startsWith("https://")).toBe(true);
      expect(Number.isNaN(Date.parse(item.observedAt))).toBe(false);
      expect(item.claim.tr.length).toBeGreaterThan(8);
      expect(item.claim.en.length).toBeGreaterThan(8);
    }
  });

  test("verified local claims, vendor statements, and unknowns remain separate", () => {
    expect(evidence.find(({ id }) => id === "isp-repo")?.state).toBe("verified");
    expect(evidence.find(({ id }) => id === "xpatla-current")?.state).toBe("vendor_claim");
    expect(evidence.find(({ id }) => id === "xpatla-source")?.state).toBe("unverified");
  });

  test("consumer accounts are explicitly allegations and link to company statements", () => {
    expect(complaintEvidence).toHaveLength(3);
    for (const item of complaintEvidence) {
      expect(item.state).toBe("user_allegation");
      expect(item.sourceUrl.startsWith("https://")).toBe(true);
      expect(item.responseUrl.startsWith("https://xpatla.com/")).toBe(true);
      expect(Number.isNaN(Date.parse(item.eventDate))).toBe(false);
    }
    expect(complaintEvidence.find(({ id }) => id === "guarantee")?.sourceUrl).toContain("eksisozluk.com/entry/");
  });
});
