import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config";
import { SITE_FAVICON_PATH, SITE_FAVICON_URL, SITE_ICON_METADATA } from "../src/lib/site-icons";

test("site favicon has a valid PNG signature and usable dimensions", () => {
  const file = readFileSync(join(process.cwd(), "public", SITE_FAVICON_PATH.slice(1)));
  expect([...file.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(file.readUInt32BE(16)).toBeGreaterThanOrEqual(48);
  expect(file.readUInt32BE(20)).toBe(file.readUInt32BE(16));
  // Pins the visually reviewed supplied mark, so the Next starter icon cannot pass.
  expect(createHash("sha256").update(file).digest("hex")).toBe("aea4ae6456fff7889659e1132706128b0901b256ceec1e717ec854e181231ce3");
  expect(file.length).toBeLessThan(512_000);
});

test("there is one canonical browser favicon, not a conflicting file convention", async () => {
  expect(existsSync(join(process.cwd(), "src/app/favicon.ico"))).toBe(false);
  expect(SITE_FAVICON_URL).toBe(SITE_FAVICON_PATH);
  expect(SITE_ICON_METADATA.icon).toEqual([{ url: SITE_FAVICON_URL, type: "image/png", sizes: "180x180" }]);
  expect(SITE_ICON_METADATA.shortcut).toEqual(SITE_ICON_METADATA.icon);
  expect(SITE_ICON_METADATA.apple).toEqual(SITE_ICON_METADATA.icon);
  const redirects = await nextConfig.redirects?.();
  expect(redirects?.find((item) => item.source === "/favicon.ico")?.destination).toBe(SITE_FAVICON_URL);
});
