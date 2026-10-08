// Standalone automation worker: one tick every ISPATLA_WORKER_TICK_MS (5-60s).
//
// Startup contract (docs/RUN-WORKER.md):
//   1. Secrets come from ~/.config/ispatla/worker.env (or ISPATLA_WORKER_ENV).
//      Values already present in the environment win; nothing is ever logged.
//   2. Exactly one writer per SQLite file. The worker claims the `automation_lock`
//      app_setting; the Next in-process scheduler claims the same row and stands
//      down when the worker holds it. Run the web process with ISPATLA_AUTOMATION=0
//      to keep it out of the loop entirely. ISPATLA_WORKER_IGNORE_LOCK=1 overrides
//      the refusal (use only when you know the other holder is dead).
//   3. One log line per tick, with per-task counts and the current pool size.

import { loadWorkerEnv } from "./worker-env";

const env = loadWorkerEnv();

const { claimAutomationLock, ensureDatabase, opportunityCount, opportunityPoolThreshold, releaseAutomationLock } = await import("../src/server/db");
const { runScheduledAutomationTasks } = await import("../src/server/automation-scheduler");
const { publishingPaused } = await import("../src/server/pipeline");

const tickMs = Math.max(5_000, Math.min(60_000, Number(process.env.ISPATLA_WORKER_TICK_MS || 15_000)));
const maxTicks = Math.max(0, Number(process.env.ISPATLA_WORKER_MAX_TICKS || 0));
const ignoreLock = process.env.ISPATLA_WORKER_IGNORE_LOCK === "1";
let stopped = false;
let ticks = 0;

function log(line: string): void {
  process.stderr.write(`[ispatla-worker] ${line}\n`);
}

log(`env=${env.found ? env.path : "yok"} loaded=${env.applied.length} kept=${env.skipped.length} tick=${tickMs}ms`);

if (!ensureDatabase()) {
  log("veritabanı başlatılamadı");
  process.exit(2);
}
const lock = claimAutomationLock("worker");
if (!lock.ok && !ignoreLock) {
  log(`başlatılamadı: automation_lock sahibi owner=${lock.holder?.owner} pid=${lock.holder?.pid} host=${lock.holder?.host}`);
  log("Next içi scheduler aynı veritabanında çalışıyor olabilir. Web sürecini ISPATLA_AUTOMATION=0 ile başlat veya ISPATLA_WORKER_IGNORE_LOCK=1 kullan.");
  process.exit(3);
}
if (!lock.ok) log(`uyarı: automation_lock owner=${lock.holder?.owner} pid=${lock.holder?.pid} yok sayıldı`);

const heartbeat = setInterval(() => {
  try {
    if (!claimAutomationLock("worker").ok) {
      log("automation_lock kaybedildi; worker duruyor");
      stopped = true;
    }
  } catch {
    log("automation_lock yenilenemedi; worker duruyor");
    stopped = true;
  }
}, tickMs);
heartbeat.unref();

process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });

while (!stopped && (!maxTicks || ticks < maxTicks)) {
  const startedAt = Date.now();
  try {
    const tickLock = claimAutomationLock("worker");
    if (!tickLock.ok) {
      log("automation_lock kaybedildi; worker duruyor");
      break;
    }
    const result = await runScheduledAutomationTasks();
    const tasks = result.tasks
      .map((task) => `${task.id}=${task.status}(${Object.entries(task.counts).map(([key, value]) => `${key}:${value}`).join(",") || "-"};${task.durationMs}ms)`)
      .join(" ");
    log(`tick=${ticks + 1} ran=${result.ran} failed=${result.failed} partial=${result.partial} pool=${opportunityCount()} threshold=${opportunityPoolThreshold()} publishing=${publishingPaused() ? "paused" : "on"} ms=${Date.now() - startedAt}${tasks ? ` ${tasks}` : ""}`);
  } catch (error) {
    log(`tick=${ticks + 1} error=${error instanceof Error ? error.message : String(error)}`);
  }
  ticks += 1;
  const waitMs = Math.max(0, tickMs - (Date.now() - startedAt));
  if (!stopped && (!maxTicks || ticks < maxTicks)) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

clearInterval(heartbeat);
releaseAutomationLock("worker");
log(`durdu ticks=${ticks}`);
