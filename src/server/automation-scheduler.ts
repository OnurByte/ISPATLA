import {
  getAutomationSchedules,
  recordAutomationLog,
  updateAutomationTaskRun,
  type AutomationTaskId,
  type AutomationTaskStatus,
} from "./db";
import { checkSourceLiveness, reconcilePending, refreshConfirmedFeedback, scanOnce } from "./pipeline";
import { runDueAutomationJobs } from "./queue-service";
import { detectXUse } from "./xuse";
import { reconcilePublicationIntents, runApprovedPublicationIntents } from "./publication-service";
import { runDueMonitors } from "./monitoring";

function due(task: { enabled: boolean; nextRunAt: number }, now: number): boolean {
  return task.enabled && task.nextRunAt <= now;
}

export async function runScheduledAutomationTasks(now = Math.floor(Date.now() / 1000)): Promise<{ failed: number; partial: number }> {
  const schedules = getAutomationSchedules(now);
  let failed = 0;
  let partial = 0;
  for (const task of schedules) {
    if (!due(task, now)) continue;
    const startedAt = Math.floor(Date.now() / 1000);
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
        const capability = detectXUse();
        const result = await runDueAutomationJobs(startedAt);
        const intents = await runApprovedPublicationIntents();
        status = result.some((job) => !job.ok) || intents.some((intent) => !intent.ok) || capability.doctor === "failed" ? "partial" : "success";
        message = capability.reason || message;
        details = { jobs: result, intents, attempted: result.length + intents.length, doctor: capability.doctor, config: capability.config };
      } else {
        const confirmed = await reconcilePending() + await reconcilePublicationIntents();
        const errors: string[] = [];
        await refreshConfirmedFeedback(startedAt, errors);
        status = errors.length ? "partial" : "success";
        details = { confirmed, errors };
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
  }
  return { failed, partial };
}
