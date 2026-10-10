import { expect, test } from "bun:test";
import {
  DRAFT_JEV_WEIGHT,
  contentLocaleInstruction,
  draftAngles,
  draftCategoryFacet,
  formatRuleFor,
  rankDraftVariants,
  writingContractFor,
  type DraftVariantCandidate,
} from "../src/server/draft-contracts";

function variant(index: number, evaluatorScore: number, jevScore: number | null, gateReason: string | null = null): DraftVariantCandidate {
  return { index, angle: `a${index}`, angleLabel: `açı ${index}`, format: "post", text: `taslak ${index}`, gateReason, evaluatorScore, jevScore };
}

test("keeps category-specific draft contracts and angles", () => {
  expect(writingContractFor("news").angles[0].id).toBe("lede");
  expect(writingContractFor("technology").angles.map((item) => item.id)).toEqual(["implication", "reader_question", "so_what"]);
  expect(writingContractFor("meme").angles[0].id).toBe("punchline");
  expect(writingContractFor("finance").angles[0].id).toBe("number_first");
  expect(writingContractFor("unknown").strategy).toBe("generic");
  expect(draftAngles(writingContractFor("technology"), 9)).toHaveLength(3);
  expect(writingContractFor("meme").bans.join(" ")).toContain("şakayı açıklayan");
});

test("applies supported content locales and safe format rules", () => {
  expect(contentLocaleInstruction("ja")).toContain("日本語");
  expect(contentLocaleInstruction(["bad", "pt-BR", "en"])).toContain("Português (Brasil)");
  expect(contentLocaleInstruction("not-a-locale")).toBe("");
  expect(formatRuleFor("quote_comment")).toContain("kaynağı özetleme");
  expect(formatRuleFor("thread_opener")).toContain("Tek başına da anlamlı");
  expect(formatRuleFor("post")).toContain("280");
});

test("variant ranking keeps blocked drafts below clean drafts", () => {
  const blended = rankDraftVariants([variant(0, 80, 10), variant(1, 40, 95), variant(2, 60, 60)]);
  expect(blended.mode).toBe("jev_blend");
  expect(blended.chosen?.index).toBe(1);
  expect(blended.chosen?.combinedScore).toBe(Math.round(95 * DRAFT_JEV_WEIGHT + 40 * (1 - DRAFT_JEV_WEIGHT)));
  const ranked = rankDraftVariants([variant(0, 99, null, "blocked"), variant(1, 20, null)]);
  expect(ranked.chosen?.index).toBe(1);
});

test("category facet carries mission and bans within its bound", () => {
  const contract = writingContractFor("meme");
  const facet = draftCategoryFacet(contract, "meme");
  expect(facet).toContain("Kategori meme");
  expect(facet.length).toBeLessThanOrEqual(700);
});
