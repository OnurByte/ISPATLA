import { test, expect } from "bun:test";
import { manualQualityGate } from "@/server/manual-drafts";

test("manual draft quality gate keeps length, source-copy, and HTTPS checks", () => {
  expect(manualQualityGate("Çok kısa")).toBe("draft is too short");
  expect(manualQualityGate("x".repeat(281))).toBe("draft exceeds 𝕏 character limit");
  const source = "Bugün yapılan açıklama yeni modelin üç farklı ülkede kullanıma açıldığını gösteriyor";
  expect(manualQualityGate(source, source)).toBe("draft copies source text");
  expect(manualQualityGate("Bu gelişme ürünün kullanımını farklı bir noktaya taşıyor", "", "http://example.com"))
    .toBe("source URL must be HTTPS");
  expect(manualQualityGate("Bu gelişme ürünün kullanımını farklı bir noktaya taşıyor", "", "https://example.com"))
    .toBeNull();
});
