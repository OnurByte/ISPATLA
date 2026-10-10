import { expect, mock, test } from "bun:test";

const writes: Array<{ table: unknown; value: unknown }> = [];
const updates: Array<{ table: unknown; value: unknown }> = [];
const accountOwners: string[] = [];
const sourceOwners: string[] = [];
let selectedSources = [{ handle: "source_one", name: "Source One", enabled: true, maxPosts: 100, rightsStatus: "unknown", profile: { status: "active" } }];

const tx = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
  insert: (table: unknown) => ({ values: (value: unknown) => ({ onConflictDoUpdate: async () => { writes.push({ table, value }); } }) }),
  update: (table: unknown) => ({ set: (value: unknown) => ({ where: async () => { updates.push({ table, value }); } }) }),
};

mock.module("@/server/postgres", () => ({ getPostgresDb: () => ({ transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx) }) }));
mock.module("@/server/owner-context", () => ({ currentOwnerId: () => "owner-1" }));
mock.module("@/server/postgres-accounts", () => ({
  getPostgresAccounts: async (owner: string) => { accountOwners.push(owner); return [{ id: 5, enabled: true }]; },
}));
mock.module("@/server/postgres-publishing", () => ({ isPostgresOwnerEnabled: async () => true }));
mock.module("@/server/postgres-sources-market", () => ({
  getPostgresAccountSources: async (owner: string) => { sourceOwners.push(owner); return selectedSources; },
}));

const now = 1_800_000_000;
const goodPost = {
  id: "1234567890123456789", url: "https://x.com/source_one/status/1234567890123456789", text: "A validated public post",
  createdAt: now - 60, author: { handle: "source_one", followers: 1200, verification: "blue" },
  metrics: { likes: 10, replies: 2, reposts: 3, quotes: 1, views: 100, capturedAt: now, quality: "ok" },
  media: [], sensitive: false,
};

test("source scan validates, deterministically scores and owner-scopes bounded PostgreSQL observations", async () => {
  const { scanPostgresSources, scoreSourcePost } = await import("../src/server/monitoring");
  const timelineCalls: Array<{ handle: string; maxPosts?: number }> = [];
  const reader = { fetchTimeline: async (input: { handle: string; maxPosts?: number }) => {
    timelineCalls.push(input);
    return { posts: [goodPost, { ...goodPost, id: "invalid" }], cursor: "ignored", receivedAt: now };
  } } as never;

  expect(scoreSourcePost("source_one", { ...goodPost, url: "https://example.com/malicious" } as never, now)).toMatchObject({
    externalId: goodPost.id,
    statusUrl: `https://x.com/source_one/status/${goodPost.id}`,
    score: expect.any(Number),
    sensitive: 0,
    rawJson: "{}",
  });
  expect(scoreSourcePost("source_one", { ...goodPost, id: "not-an-id" } as never, now)).toBeNull();

  const result = await scanPostgresSources({ reader, now });
  expect(result).toMatchObject({ status: "ok", sourceCount: 1, postsSeen: 2, postsNew: 1, postsScored: 1, errors: [] });
  expect(accountOwners).toEqual(["owner-1"]);
  expect(sourceOwners).toEqual(["owner-1"]);
  expect(timelineCalls).toEqual([{ handle: "source_one", maxPosts: 50 }]);
  expect(writes).toHaveLength(1);
  expect((writes[0]?.value as object[])[0]).toMatchObject({ externalId: goodPost.id, sourceHandle: "source_one", score: expect.any(Number) });
  expect((writes[0]?.value as object[])[0]).not.toHaveProperty("publishStatus");
  expect(updates).toEqual([{ table: expect.anything(), value: expect.objectContaining({ lastEvidenceAt: expect.anything() }) }]);
});

test("source scan caps a single owner at 10 public source reads per request", async () => {
  selectedSources = Array.from({ length: 30 }, (_, index) => ({
    handle: `source_${index}`, name: `Source ${index}`, enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { status: "active" },
  }));
  const { scanPostgresSources } = await import("../src/server/monitoring");
  let calls = 0;
  const result = await scanPostgresSources({ reader: { fetchTimeline: async () => {
    calls++;
    return { posts: [], cursor: "", receivedAt: now };
  } } as never, now });

  expect(calls).toBe(10);
  expect(result).toMatchObject({ status: "partial", sourceCount: 10, postsSeen: 0, postsNew: 0, postsScored: 0 });
  expect(result.errors).toEqual(["source limit reached (10)"]);
});
