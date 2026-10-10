import { expect, mock, test } from "bun:test";

const calls: string[] = [];
const job = { id: 7, draftId: 11, accountId: 5, action: "post", status: "queued" };
const intent = { id: 9, draftId: 11, accountId: 5, status: "pending_approval" };
const queued: number[][] = [];
mock.module("@/server/request-auth", () => ({ withUser: (handler: (...args: never[]) => unknown) => handler }));
mock.module("@/server/api-guard", () => ({ guardMutation: () => null, readJsonBody: async (request: Request) => request.json() }));
mock.module("@/server/owner-context", () => ({ currentOwnerId: () => "owner-a" }));
mock.module("@/server/dashboard", () => ({ getAutomationRuntime: () => ({ owner: "none", heartbeatAt: null, healthy: false, lagSeconds: null }) }));
mock.module("@/server/postgres-x-oauth", () => ({ getPostgresXAccounts: async () => [] }));
mock.module("@/server/postgres-settings", () => ({
  AUTOMATION_TASK_IDS: ["queue_worker"],
  getPostgresAutomationLogs: async () => [],
  getPostgresAutomationSchedules: async () => [],
  savePostgresAutomationSchedule: async () => ({}),
  setPostgresSetting: async () => { calls.push("set-setting"); },
}));
mock.module("@/server/postgres-queue-store", () => ({
  listPostgresQueueJobs: async () => [job], getPostgresQueueJob: async () => job,
  updatePostgresQueueJob: async (input: { status: string }) => { calls.push(`update:${input.status}`); return { ...job, status: input.status }; },
  listPostgresPublicationIntents: async () => [intent], getPostgresPublicationIntent: async () => intent,
  approvePostgresPublicationIntent: async () => ({ ...intent, status: "approved" }),
  setPostgresPublicationIntentStatus: async () => ({ ...intent, status: "cancelled" }),
}));
mock.module("../src/server/queue-service", () => ({
  runAutomationJob: async () => ({ ok: false, job, reason: "PostgreSQL policy evidence is not ready" }),
  queueDraftIds: async (ids: number[]) => { queued.push(ids); return { intents: [intent], jobs: [job] }; },
}));
const queueRoute = await import("../src/app/api/queue/route");
const draftQueueRoute = await import("../src/app/api/drafts/[id]/queue/route");
const batchQueueRoute = await import("../src/app/api/drafts/batch/queue/route");
const queueIdRoute = await import("../src/app/api/queue/[id]/route");
const queueRunRoute = await import("../src/app/api/queue/[id]/run/route");
const publicationsRoute = await import("../src/app/api/publications/route");
const publicationIdRoute = await import("../src/app/api/publications/[id]/route");
const automationRoute = await import("../src/app/api/settings/automation/route");

const request = (url: string, method = "GET", body?: unknown) => new Request(url, {
  method, headers: { origin: "http://localhost", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

test("queue and publication reads return PostgreSQL owner-scoped rows", async () => {
  expect(await (await queueRoute.GET()).json()).toEqual([job]);
  expect(await (await publicationsRoute.GET()).json()).toEqual([intent]);
});

test("single and batch draft queue routes use the PostgreSQL queue service with bounded IDs", async () => {
  queued.length = 0;
  const single = await draftQueueRoute.POST(request("http://localhost/api/drafts/11/queue", "POST"), { params: Promise.resolve({ id: "11" }) });
  expect(single.status).toBe(200);
  expect(queued).toEqual([[11]]);
  const batch = await batchQueueRoute.POST(request("http://localhost/api/drafts/batch/queue", "POST", { draftIds: [11, 12] }));
  expect(batch.status).toBe(200);
  expect(queued).toEqual([[11], [11, 12]]);
  const invalid = await batchQueueRoute.POST(request("http://localhost/api/drafts/batch/queue", "POST", { draftIds: [11, "12"] }));
  expect(invalid.status).toBe(400);
  expect(queued).toHaveLength(2);
});

test("queue mutations validate status and keep publication runner fail-closed", async () => {
  calls.length = 0;
  const bad = await queueIdRoute.PATCH(request("http://localhost/api/queue/7", "PATCH", { status: "confirmed" }), { params: Promise.resolve({ id: "7" }) });
  expect(bad.status).toBe(400);
  expect(calls).toEqual([]);
  const result = await queueRunRoute.POST(request("http://localhost/api/queue/7/run", "POST"), { params: Promise.resolve({ id: "7" }) });
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ ok: false, reason: "PostgreSQL policy evidence is not ready" });
});

test("publication approval remains an explicit owner-authenticated action", async () => {
  const response = await publicationIdRoute.POST(request("http://localhost/api/publications/9", "POST", { action: "approve" }), { params: Promise.resolve({ id: "9" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 9, status: "approved" });
});

test("automation settings reject unknown actions instead of silently changing pause state", async () => {
  process.env.ISPATLA_OPERATOR_USER_ID = "owner-a";
  calls.length = 0;
  const response = await automationRoute.POST(request("http://localhost/api/settings/automation", "POST", { paused: false }));
  expect(response.status).toBe(400);
  expect(calls).toEqual([]);
});
