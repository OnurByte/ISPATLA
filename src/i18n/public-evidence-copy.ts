import type { Locale } from "./config";
import { publicEvidenceCopyLocal } from "./public-evidence-copy-local";
import { publicEvidenceCopyExtra } from "./public-evidence-copy-extra";
import type { PublicEvidenceCopy } from "./public-evidence-copy-types";

export const publicEvidenceCopy = { ...publicEvidenceCopyLocal, ...publicEvidenceCopyExtra } as Record<Locale, PublicEvidenceCopy>;

const paths = {
  "/open-source": "openSource",
  "/transparency": "transparency",
  "/no-viral-guarantee": "noViral",
  "/research/xpatla-consumer-complaints-2026": "research",
} as const;
type EvidencePath = keyof typeof paths;

export function publicEvidencePageCopy(locale: Locale, path: EvidencePath): { title: string; description: string } {
  const page = publicEvidenceCopy[locale].pages[paths[path]];
  return { title: page.title, description: page.description };
}
