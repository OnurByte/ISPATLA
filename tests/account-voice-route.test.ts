import { expect, mock, test } from "bun:test";

const account = {
  id: 7, ownerUserId: "owner-1", accountKey: "x:writer", handle: "writer", displayName: "Writer", enabled: true,
  defaultAccount: true, automationMode: "manual" as const, dailyLimit: 10, capabilities: ["draft"],
  styleProfile: { tone: "measured", voice: null as unknown }, updatedAt: 1,
};
let accountOwner = "";
let savedInput: Record<string, unknown> | null = null;

mock.module("@/server/request-auth", () => ({ withUser: (handler: (...args: never[]) => unknown) => handler }));
mock.module("@/server/api-guard", () => ({ guardMutation: () => null, readJsonBody: async (request: Request) => request.json() }));
mock.module("@/server/owner-context", () => ({ currentOwnerId: () => "owner-1" }));
mock.module("@/server/postgres-accounts", () => ({
  getPostgresAccount: async (owner: string, id: number) => { accountOwner = owner; return owner === account.ownerUserId && id === account.id ? account : null; },
  updatePostgresAccount: async (input: Record<string, unknown>) => { savedInput = input; return account; },
}));
mock.module("@/server/voice-profile", () => ({
  buildVoiceProfile: (_posts: unknown[], { handle }: { handle: string }) => ({ handle, version: 1, voiceContract: "contract", features: {}, exemplars: [] }),
  fetchVoiceProfile: async ({ handle }: { handle: string }) => ({ handle, version: 1, voiceContract: "contract", features: {}, exemplars: [] }),
  voiceProfileSummary: () => ({ sampleSize: 1 }),
}));

test("account voice route reads and additively saves its owner-scoped PostgreSQL style profile", async () => {
  savedInput = null;
  accountOwner = "";
  const { GET, POST } = await import("../src/app/api/accounts/[id]/voice/route");
  const context = { params: Promise.resolve({ id: "7" }) };
  const get = await GET(new Request("http://localhost/api/accounts/7/voice"), context);
  expect(get.status).toBe(200);
  expect(await get.json()).toEqual({ handle: "writer", voice: null });
  expect(accountOwner).toBe("owner-1");

  const post = await POST(new Request("http://localhost/api/accounts/7/voice", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ posts: [{ text: "Sample post long enough" }] }),
  }), context);
  expect(post.status).toBe(201);
  expect(savedInput).toMatchObject({ owner: "owner-1", styleProfile: { tone: "measured", voice: { handle: "writer" } } });
});
