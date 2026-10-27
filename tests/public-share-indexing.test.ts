import { expect, mock, test } from "bun:test";
let available = true;
mock.module("@/server/hit-sharing", () => ({ readPublicXPostShare: async () => available ? { accountHandle: "fixture", text: "A source-backed public observation.", publishedAt: 1793000000, observedAt: 1793000060 } : null }));
mock.module("@/components/public-header", () => ({ requestPublicLocale: async () => "en", PublicHeader: () => null }));
const { generateMetadata } = await import("@/app/h/[publicId]/page");
test("a valid public observation opts into indexing instead of inheriting private-shell noindex", async () => {
  available = true;
  expect((await generateMetadata({ params: Promise.resolve({ publicId: "local-fixture" }) })).robots).toEqual({ index: true, follow: true });
  available = false;
  expect((await generateMetadata({ params: Promise.resolve({ publicId: "missing" }) })).robots).toEqual({ index: false, follow: false });
});
