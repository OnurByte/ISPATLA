import { expect, mock, test } from "bun:test";

const logs: Array<Record<string, unknown>> = [];
let schedules = [{ id: "account_inference", enabled: true, intervalSeconds: 300, nextRunAt: 2000, lastRunAt: 0, lastStatus: "never", updatedAt: 1999 }];
mock.module("../src/server/postgres", () => ({ getPostgresDb: () => ({ insert: () => ({ values: async (value: Record<string, unknown>) => { logs.push(value); } }) }) }));
mock.module("../src/server/postgres-schema", () => ({ automationLogs: {} }));
mock.module("../src/server/postgres-settings", () => ({
  AUTOMATION_TASK_IDS: ["monitor_engine", "source_scan", "source_liveness", "queue_worker", "reconciliation", "account_inference"],
  getPostgresAutomationSchedules: async () => schedules,
  getPostgresAutomationLogs: async () => [],
  savePostgresAutomationSchedule: async () => ({}),
  getPostgresSetting: async (_name: string, fallback: string) => fallback,
  setPostgresSetting: async (_name: string, value: string) => { schedules = JSON.parse(value); },
}));
mock.module("../src/server/queue-service", () => ({ reconcileAutomationJobs: async () => 0, runDueAutomationJobs: async () => [],
  runAutomationJob: async () => ({ ok: false, job: null, reason: "PostgreSQL policy evidence is not ready" }) }));
mock.module("../src/server/publication-service", () => ({ reconcilePublicationIntents: async () => 0, runApprovedPublicationIntents: async () => [] }));
mock.module("../src/server/monitoring", () => ({ runDueMonitors: async () => ({ attempted: 0, failed: 0, skipped: 1 }) }));
mock.module("../src/server/account-inference", () => ({ runPendingAccountCategoryInferences: async () => ({ attempted: 1, completed: 1, skipped: 0, failed: 0 }) }));
const { runScheduledAutomationTasks } = await import("../src/server/automation-scheduler");

test("the shared worker records PostgreSQL-backed account-inference outcomes", async () => {
  schedules = [{ id: "account_inference", enabled: true, intervalSeconds: 300, nextRunAt: 2000, lastRunAt: 0, lastStatus: "never", updatedAt: 1999 }];
  const result = await runScheduledAutomationTasks(2000);
  expect(result).toMatchObject({ ran: 1, failed: 0, partial: 0 });
  expect(result.tasks[0]).toMatchObject({ id: "account_inference", status: "success", counts: { attempted: 1, completed: 1, skipped: 0, failed: 0 } });
  expect(schedules[0]).toMatchObject({ id: "account_inference", lastStatus: "success", lastRunAt: expect.any(Number) });
  expect(logs.map((item) => item.status)).toEqual(["running", "success"]);
});

test("scheduled PostgreSQL reconciliation is recorded as completed", async () => {
  logs.length = 0;
  schedules = [{ id: "reconciliation", enabled: true, intervalSeconds: 300, nextRunAt: 2000, lastRunAt: 0, lastStatus: "never", updatedAt: 1999 }];
  const result = await runScheduledAutomationTasks(2000);
  expect(result.tasks[0]).toMatchObject({ id: "reconciliation", status: "success", counts: { confirmed: 0 } });
  expect(schedules[0]).toMatchObject({ id: "reconciliation", lastStatus: "success" });
  expect(logs.map((item) => item.status)).toEqual(["running", "success"]);
});
