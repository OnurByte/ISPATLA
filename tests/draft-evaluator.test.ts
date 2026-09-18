import { expect, test } from "bun:test";
import { extractDraftFeatures, scoreDraftFeatures } from "../src/server/draft-evaluator";
import type { DraftSemanticFeatures } from "../src/server/ai";

test("extracts deterministic draft features without treating source context as performance truth", () => {
  const features = extractDraftFeatures("2026 verisine göre oran %42. Ayrıntı: https://example.com ?", "photo");
  expect(features).toMatchObject({
    urlCount: 1,
    numberTokenCount: 2,
    question: true,
    mediaType: "photo",
  });
  expect(features.charCount).toBeGreaterThan(20);
});

test("semantic quality can lift a draft while bait risk drags it down", () => {
  const features = extractDraftFeatures("2026 verisine göre açık kaynak kullanımında %42 artış görüldü. En büyük değişim geliştirici araçlarında.", "none");
  const strong: DraftSemanticFeatures = {
    hookStrength: 85,
    specificity: 92,
    clarity: 90,
    novelty: 78,
    replyPotential: 62,
    repostPotential: 80,
    accountFit: 90,
    baitRisk: 5,
    helped: ["spesifik veri"],
    hurt: [],
    model: "test",
    provider: "api",
  };
  const bait: DraftSemanticFeatures = {
    ...strong,
    hookStrength: 55,
    clarity: 45,
    accountFit: 50,
    baitRisk: 95,
    helped: [],
    hurt: ["engagement bait riski"],
  };
  const strongScore = scoreDraftFeatures(features, strong);
  const baitScore = scoreDraftFeatures(features, bait);
  expect(strongScore.score).toBeGreaterThan(baitScore.score);
  expect(strongScore.helped).toContain("spesifik veri");
  expect(baitScore.hurt).toContain("engagement bait riski");
});
