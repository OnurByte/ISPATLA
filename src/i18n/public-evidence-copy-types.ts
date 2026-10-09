import type { Locale } from "./config";

export type PublicEvidenceSectionCopy = { heading: string; body: string };
export type PublicEvidencePageCopy = { title: string; description: string; summary: string; sections: PublicEvidenceSectionCopy[] };
export type PublicEvidenceCopy = {
  researchHook: string;
  pages: {
    openSource: PublicEvidencePageCopy;
    transparency: PublicEvidencePageCopy;
    noViral: PublicEvidencePageCopy;
    research: PublicEvidencePageCopy;
  };
  common: {
    checked: string;
    method: string;
    source: string;
    newTab: string;
    disclaimer: string;
    methodText: string;
    languageLink: string;
    correction: string;
    correctionLink: string;
  };
  complaintSummary: [string, string, string];
  complaintResponse: [string, string, string];
};

export type PartialEvidenceCopy = Partial<Record<Locale, PublicEvidenceCopy>>;
