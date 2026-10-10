// Standalone PostgreSQL automation worker: one tick every ISPATLA_WORKER_TICK_MS (5-60s).
import { sql } from "drizzle-orm";
import { getPostgresDb, getPostgresPool } from "../src/server/postgres";
import { runScheduledAutomationTasks } from "../src/server/automation-scheduler";
import { loadWorkerEnv } from "./worker-env";

const env = loadWorkerEnv();
const tickMs = Math.max(5_000, Math.min(60_000, Number(process.env.ISPATLA_WORKER_TICK_MS || 15_000)));
const maxTicks = Math.max(0, Number(process.env.ISPATLA_WORKER_MAX_TICKS || 0));
let stopped = false;
let ticks = 0;

function log(line: string): void { process.stderr.write(`[ispatla-worker] ${line}\n`); }

async function withWorkerLease<T>(run: () => Promise<T>): Promise<T | null> {
  return getPostgresDb().transaction(async (tx) => {
    // The xact lock is released on commit or process/connection failure.
    const result = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(1397965904, 1) AS acquired`);
    if (result.rows[0]?.acquired !== true) return null;
    return run();
  });
}

log(`env=${env.found ? env.path : "yok"} loaded=${env.applied.length} kept=${env.skipped.length} tick=${tickMs}ms`);
process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });

try {
  getPostgresDb();
  while (!stopped && (!maxTicks || ticks < maxTicks)) {
    const startedAt = Date.now();
    try {
      const result = await withWorkerLease(runScheduledAutomationTasks);
      if (result === null) log(`tick=${ticks + 1} skipped=worker_lease_held`);
      else {
        const tasks = result.tasks.map((task) => `${task.id}=${task.status}(${Object.entries(task.counts).map(([key, value]) => `${key}:${value}`).join(",") || "-"};${task.durationMs}ms)`).join(" ");
        log(`tick=${ticks + 1} ran=${result.ran} failed=${result.failed} partial=${result.partial}${tasks ? ` ${tasks}` : ""}`);
      }
    } catch (error) {
      log(`tick=${ticks + 1} error=${error instanceof Error ? error.message : String(error)}`);
    }
    ticks += 1;
    const waitMs = Math.max(0, tickMs - (Date.now() - startedAt));
    if (!stopped && (!maxTicks || ticks < maxTicks)) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
} catch (error) {
  process.exitCode = 2;
  log(`başlatılamadı: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  // A missing DATABASE_URL can prevent pool construction.
  try { await getPostgresPool().end(); } catch { /* no pool was created */ }
  log(`durdu ticks=${ticks}`);
}
