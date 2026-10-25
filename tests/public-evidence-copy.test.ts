import { expect, test } from "bun:test";
import { LOCALES } from "../src/i18n/config";
import { publicEvidenceCopy } from "../src/i18n/public-evidence-copy";

test("all twenty languages have complete localized public evidence pages", () => {
  expect(Object.keys(publicEvidenceCopy).sort()).toEqual([...LOCALES].sort());
  for (const locale of LOCALES) {
    const evidence = publicEvidenceCopy[locale];
    for (const page of Object.values(evidence.pages)) {
      expect(page.title.trim().length, locale).toBeGreaterThan(5);
      expect(page.description.trim().length, locale).toBeGreaterThan(10);
      expect(page.sections.length, locale).toBeGreaterThanOrEqual(2);
      expect(page.sections.every((section) => section.heading && section.body), locale).toBe(true);
    }
    expect(evidence.complaintSummary).toHaveLength(3);
    expect(evidence.complaintResponse).toHaveLength(3);
  }
});
