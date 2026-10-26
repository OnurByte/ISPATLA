import { expect, test } from "bun:test";
import { GET } from "../src/app/api/og/route";
import { LOCALES } from "../src/i18n/config";

test("all twenty localized OG cards render as 1200 by 630 PNGs", async () => {
  const responses = await Promise.all(LOCALES.map(async (locale) => {
    const response = await GET(new Request(`http://localhost/api/og?locale=${encodeURIComponent(locale)}`));
    return { locale, response, bytes: new Uint8Array(await response.arrayBuffer()) };
  }));
  for (const { response, bytes } of responses) {
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(1200);
    expect(new DataView(bytes.buffer).getUint32(20)).toBe(630);
  }
}, 60_000);
