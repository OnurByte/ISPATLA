import { expect, test } from "bun:test";
import { GET } from "../src/app/api/og/route";

// Render the scripts whose font shaping previously failed in the live endpoint.
test("OG cards render Arabic, Urdu and Devanagari with local fonts", async () => {
  for (const locale of ["ar", "ur", "hi"]) {
    const response = await GET(new Request(`http://localhost/api/og?locale=${locale}`));
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(1200);
    expect(new DataView(bytes.buffer).getUint32(20)).toBe(630);
  }
});
