import { expect, test } from "bun:test";
import LeaderboardImage from "../src/app/(workspace)/leaderboard/opengraph-image";
import HitImage from "../src/app/h/[publicId]/opengraph-image";
import ProfileImage from "../src/app/[handle]/opengraph-image";

test("leaderboard social image is a 1200×630 PNG", async () => {
  const response = await LeaderboardImage();
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(new DataView(bytes.buffer).getUint32(16)).toBe(1200);
  expect(new DataView(bytes.buffer).getUint32(20)).toBe(630);
});

test("missing public proof images never generate a card", async () => {
  const unknownHit = await HitImage({ params: Promise.resolve({ publicId: "invalid" }) });
  expect(unknownHit.status).toBe(404);
  const unknownProfile = await ProfileImage({ params: Promise.resolve({ handle: "!invalid!" }) });
  expect(unknownProfile.status).toBe(404);
});
