import { runScheduledAutomationTasks } from "../src/server/automation-scheduler";

const tickMs = Math.max(5_000, Math.min(60_000, Number(process.env.ISPATLA_WORKER_TICK_MS || 15_000)));
const maxTicks = Math.max(0, Number(process.env.ISPATLA_WORKER_MAX_TICKS || 0));
let stopped = false;
let ticks = 0;

process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });

while (!stopped && (!maxTicks || ticks < maxTicks)) {
  const startedAt = Date.now();
  try {
    const result = await runScheduledAutomationTasks();
    process.stderr.write(`[ispatla-worker] tick=${ticks + 1} failed=${result.failed} partial=${result.partial}\n`);
  } catch (error) {
    process.stderr.write(`[ispatla-worker] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  ticks += 1;
  const waitMs = Math.max(0, tickMs - (Date.now() - startedAt));
  if (!stopped && (!maxTicks || ticks < maxTicks)) await new Promise((resolve) => setTimeout(resolve, waitMs));
}
