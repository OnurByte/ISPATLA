import { reconcileAutomationJobs, runDueAutomationJobs } from "./queue-service";
import { reconcilePublicationIntents, runApprovedPublicationIntents } from "./publication-service";
import { runDueMonitors } from "./monitoring";
import { runPendingAccountCategoryInferences } from "./account-inference";
import { getPostgresDb } from "./postgres";
import { automationLogs } from "./postgres-schema";
import { getPostgresAutomationSchedules, getPostgresSetting, setPostgresSetting, type AutomationTaskId, type AutomationTaskStatus } from "./postgres-settings";

function due(task: { enabled: boolean; nextRunAt: number }, now: number): boolean {
  return task.enabled && task.nextRunAt <= now;
}

export type AutomationTaskOutcome = {
  id: string;
  status: AutomationTaskStatus | "partial" | "skipped";
  durationMs: number;
  /** Compact per-task counters for the worker's one-line tick log. */
  counts: Record<string, number>;
};

export type AutomationTickResult = {
  failed: number;
  partial: number;
  ran: number;
  tasks: AutomationTaskOutcome[];
};

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The handful of numbers worth one log line per tick, per task. */
function countsOf(taskId: string, details: Record<string, unknown>): Record<string, number> {
  const wanted: Record<string, string[]> = {
    monitor_engine: ["attempted", "skipped", "failed"],
    source_scan: ["sources", "postsSeen", "postsNew", "postsScored"],
    source_liveness: ["checked", "unreachable"],
    queue_worker: ["attempted"],
    account_inference: ["attempted", "completed", "skipped", "failed"],
  };
  const keys = wanted[taskId] || ["confirmed"];
  const result: Record<string, number> = {};
  for (const key of keys) {
    const value = count(details[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export async function runScheduledAutomationTasks(now = Math.floor(Date.now() / 1000)): Promise<AutomationTickResult> {
  const schedules = await getPostgresAutomationSchedules(now);
  const tasks: AutomationTaskOutcome[] = [];
  let failed = 0;
  let partial = 0;
  for (const task of schedules) {
    if (!due(task, now)) continue;
    const startedAt = Math.floor(Date.now() / 1000);
    const startedMs = Date.now();
    await recordAutomationLog({ taskId: task.id, status: "running", startedAt, message: `${task.id} başladı` });
    let status: AutomationTaskStatus | "partial" | "skipped" = "success";
    let message = `${task.id} tamamlandı`;
    let details: Record<string, unknown> = {};
    try {
      if (task.id === "monitor_engine") {
        const result = await runDueMonitors(startedAt);
        status = result.failed > 0 ? "partial" : result.skipped > 0 && result.attempted === result.skipped ? "skipped" : "success";
        details = result;
      } else if (task.id === "source_scan") {
        status = "skipped";
        message = "Kaynak taraması PostgreSQL taşıması tamamlanana kadar kapalı";
      } else if (task.id === "source_liveness") {
        status = "skipped";
        message = "Kaynak sağlık kontrolü PostgreSQL taşıması tamamlanana kadar kapalı";
      } else if (task.id === "queue_worker") {
        // publishing_paused / automation_paused stop dispatching; the pool keeps filling.
        const publishing = await getPostgresSetting("publishing_paused", "0") !== "1"
          && await getPostgresSetting("automation_paused", "0") !== "1";
        const result = publishing ? await runDueAutomationJobs(startedAt) : [];
        const intents = publishing ? await runApprovedPublicationIntents() : [];
        status = result.some((job) => !job.ok) || intents.some((intent) => !intent.ok) ? "partial" : "success";
        details = { jobs: result, intents, attempted: result.length + intents.length, publishing };
      } else if (task.id === "account_inference") {
        const result = await runPendingAccountCategoryInferences({ now: startedAt, limit: 5 });
        status = result.failed > 0 ? "partial" : result.attempted === 0 ? "skipped" : "success";
        details = result;
        if (result.failed > 0) message = `${result.failed} hesap için kategori analizi tamamlanamadı`;
      } else {
        const confirmed = await reconcilePublicationIntents() + await reconcileAutomationJobs(20, { now: () => startedAt });
        details = { confirmed };
        message = `${confirmed} yayın PostgreSQL kanıtıyla uzlaştırıldı`;
      }
    } catch (error) {
      status = "failed";
      message = error instanceof Error ? error.message : String(error);
    }
    const finishedAt = Math.floor(Date.now() / 1000);
    if (status === "failed") failed += 1;
    if (status === "partial") partial += 1;
    const schedules = await getPostgresAutomationSchedules(finishedAt);
    await setPostgresSetting("automation_schedules", JSON.stringify(schedules.map((item) => item.id === task.id
      ? { ...item, lastRunAt: finishedAt, lastStatus: status === "partial" ? "failed" : status === "skipped" ? "never" : status, nextRunAt: finishedAt + item.intervalSeconds, updatedAt: finishedAt }
      : item)), finishedAt);
    await recordAutomationLog({ taskId: task.id, status, startedAt, finishedAt, message, details });
    tasks.push({ id: task.id, status, durationMs: Math.max(0, Date.now() - startedMs), counts: countsOf(task.id, details) });
  }
  return { failed, partial, ran: tasks.length, tasks };
}

async function recordAutomationLog(input: { taskId: AutomationTaskId; status: string; startedAt: number; finishedAt?: number | null; message?: string; details?: Record<string, unknown> }) {
  await getPostgresDb().insert(automationLogs).values({ taskId: input.taskId, status: input.status, startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? null, message: input.message || "", detailsJson: JSON.stringify(input.details || {}) });
}
