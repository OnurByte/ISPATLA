import { expect, test } from "bun:test";
import { describeOfficialXCapabilities } from "../src/server/official-x-access";

test("capabilities distinguish granted scopes from operations disabled before Prime", () => {
  const status = describeOfficialXCapabilities(["tweet.write", "media.write"]);
  expect(status).toEqual({
    apiEnabled: false,
    unavailableReason: "prime_unavailable",
    providerCapabilities: { post: true, repost: true, reply: true, media: true, quote: "unknown" },
    capabilities: { post: false, repost: false, reply: false, media: false, quote: "disabled" },
  });
});

test("configuration cannot activate Prime capabilities without entitlement enforcement", () => {
  const previous = process.env.ISPATLA_PRIME_ENABLED;
  process.env.ISPATLA_PRIME_ENABLED = "1";
  try {
    const status = describeOfficialXCapabilities(["tweet.write", "media.write"]);
    expect(status.apiEnabled).toBe(false);
    expect(status.unavailableReason).toBe("prime_unavailable");
    expect(status.capabilities).toEqual({ post: false, repost: false, reply: false, media: false, quote: "disabled" });
  } finally {
    if (previous === undefined) delete process.env.ISPATLA_PRIME_ENABLED;
    else process.env.ISPATLA_PRIME_ENABLED = previous;
  }
});
