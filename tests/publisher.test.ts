import { expect, test } from "bun:test";
import { XUsePublisher, publish } from "@/server/publisher";

const account = { id: 1, accountKey: "main", handle: "main", displayName: "Main", xuseAccountId: "main", enabled: true, defaultAccount: true, automationMode: "auto" as const, dailyLimit: 24, capabilities: [], styleProfile: {}, subscriptionHistory: [], subscriptionState: { tier: "unknown" as const, observedAt: 0, historyComplete: false }, updatedAt: 1 };

test("uses only x-use for publication transport", async () => {
  const previous = process.env.XUSE_BIN;
  process.env.XUSE_BIN = "/definitely-not-an-x-use-binary";
  try {
    const publisher = new XUsePublisher();
    expect(publisher.health(account)).toMatchObject({ ok: false });
    expect(publisher.capabilities(account)).toEqual({ post: false, media: false, reconciliation: "required" });
    await expect(publish({ account, text: "hello" })).resolves.toMatchObject({ ok: false, transport: "xuse" });
  } finally {
    if (previous === undefined) delete process.env.XUSE_BIN;
    else process.env.XUSE_BIN = previous;
  }
});
