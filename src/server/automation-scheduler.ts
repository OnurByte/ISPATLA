import {
  getAutomationSchedules,
  recordAutomationLog,
  updateAutomationTaskRun,
  type AutomationTaskId,
  type AutomationTaskStatus,
} from "./db";
import { checkSourceLiveness, publishingEnabled, reconcilePending, refreshConfirmedFeedback, scanOnce } from "./pipeline";
import { reconcileAutomationJobs, runDueAutomationJobs } from "./queue-service";
import { reconcilePublicationIntents, runApprovedPublicationIntents } from "./publication-service";
import { runDueMonitors } from "./monitoring";
import { collectDueShadowOutcomes } from "./shadow-evaluation";
import { runPendingAccountCategoryInferences } from "./account-inference";

function due(task: { enabled: boolean; nextRunAt: number }, now: number): boolean {
  return task.enabled && task.nextRunAt <= now;
}

export type AutomationTaskOutcome = {
  id: string;
  status: AutomationTaskStatus;
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
  const schedules = getAutomationSchedules(now);
  const tasks: AutomationTaskOutcome[] = [];
  let failed = 0;
  let partial = 0;
  for (const task of schedules) {
    if (!due(task, now)) continue;
    const startedAt = Math.floor(Date.now() / 1000);
    const startedMs = Date.now();
    recordAutomationLog({ taskId: task.id, status: "running", startedAt, message: `${task.id} başladı` });
    let status: AutomationTaskStatus = "success";
    let message = `${task.id} tamamlandı`;
    let details: Record<string, unknown> = {};
    try {
      if (task.id === "monitor_engine") {
        const result = await runDueMonitors(startedAt);
        status = result.failed > 0 ? "partial" : result.skipped > 0 && result.attempted === result.skipped ? "skipped" : "success";
        details = result;
      } else if (task.id === "source_scan") {
        const result = await scanOnce();
        status = result.status === "ok" ? "success" : result.status === "partial" ? "partial" : "skipped";
        message = result.errors.join(" | ") || message;
        details = { sources: result.sourceCount, postsSeen: result.postsSeen, postsNew: result.postsNew, postsScored: result.postsScored };
      } else if (task.id === "source_liveness") {
        const result = await checkSourceLiveness(startedAt);
        status = result.unreachable > 0 ? "partial" : "success";
        details = result;
      } else if (task.id === "queue_worker") {
        // publishing_paused / automation_paused stop dispatching; the pool keeps filling.
        const publishing = publishingEnabled();
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
        const confirmed = await reconcilePending() + await reconcilePublicationIntents() + await reconcileAutomationJobs(20, { now: () => startedAt });
        const errors: string[] = [];
        await refreshConfirmedFeedback(startedAt, errors);
        const shadowOutcomes = await collectDueShadowOutcomes(startedAt);
        status = errors.length || shadowOutcomes.failed > 0 ? "partial" : "success";
        details = { confirmed, errors, shadowOutcomes };
      }
    } catch (error) {
      status = "failed";
      message = error instanceof Error ? error.message : String(error);
    }
    const finishedAt = Math.floor(Date.now() / 1000);
    if (status === "failed") failed += 1;
    if (status === "partial") partial += 1;
    updateAutomationTaskRun(task.id as AutomationTaskId, status, finishedAt);
    recordAutomationLog({ taskId: task.id, status, startedAt, finishedAt, message, details });
    tasks.push({ id: task.id, status, durationMs: Math.max(0, Date.now() - startedMs), counts: countsOf(task.id, details) });
  }
  return { failed, partial, ran: tasks.length, tasks };
}
