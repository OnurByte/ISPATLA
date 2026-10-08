import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("dashboard runtime requires a recent known scheduler heartbeat", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-runtime-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import { ensureDatabase, setSetting, claimAutomationLock, AUTOMATION_LOCK_TTL_SECONDS } from "./src/server/db.ts";
        import { getAutomationRuntime } from "./src/server/dashboard.ts";
        ensureDatabase();
        const now = 1750000000;
        const absent = getAutomationRuntime(now);
        claimAutomationLock("worker", now, 111, "test-host");
        const worker = getAutomationRuntime(now + 9);
        const stale = getAutomationRuntime(now + AUTOMATION_LOCK_TTL_SECONDS + 1);
        setSetting("automation_lock", JSON.stringify({owner:"unexpected",pid:111,host:"test-host",at:now}), now);
        const unknown = getAutomationRuntime(now);
        setSetting("automation_lock", JSON.stringify({owner:"web",pid:111,host:"test-host",at:now+60}), now);
        const future = getAutomationRuntime(now);
        console.log(JSON.stringify({absent, worker, stale, unknown, future}));
      `],
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const data = JSON.parse(result.stdout.toString());
    const inactive = { owner: "none", heartbeatAt: null, healthy: false, lagSeconds: null };
    expect(data.absent).toEqual(inactive);
    expect(data.stale).toEqual(inactive);
    expect(data.unknown).toEqual(inactive);
    expect(data.future).toEqual(inactive);
    expect(data.worker).toEqual({ owner: "worker", heartbeatAt: 1750000000, healthy: true, lagSeconds: 9 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone worker publishes a real heartbeat and releases it on exit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-worker-smoke-"));
  const env = { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_WORKER_ENV: join(directory, "empty.env"), ISPATLA_WORKER_MAX_TICKS: "2", ISPATLA_WORKER_TICK_MS: "5000" };
  writeFileSync(env.ISPATLA_WORKER_ENV, "");
  const setup = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { ensureDatabase, getAutomationSchedules, saveAutomationSchedule } from "./src/server/db.ts";
    ensureDatabase();
    const now = Math.floor(Date.now()/1000);
    for (const task of getAutomationSchedules(now)) saveAutomationSchedule({...task, enabled:false, now});
  `], env, stdout: "pipe", stderr: "pipe" });
  expect(setup.exitCode, setup.stderr.toString()).toBe(0);
  const worker = Bun.spawn({ cmd: [process.execPath, "scripts/automation-worker.ts"], env, stdout: "pipe", stderr: "pipe" });
  try {
    let runtime: { owner: string; healthy: boolean } = { owner: "none", healthy: false };
    for (let attempt = 0; attempt < 20 && !runtime.healthy; attempt++) {
      await Bun.sleep(100);
      const probe = Bun.spawnSync({ cmd: [process.execPath, "-e", 'import {getAutomationRuntime} from "./src/server/dashboard.ts"; console.log(JSON.stringify(getAutomationRuntime()));'], env, stdout: "pipe", stderr: "pipe" });
      expect(probe.exitCode, probe.stderr.toString()).toBe(0);
      runtime = JSON.parse(probe.stdout.toString());
    }
    expect(runtime).toMatchObject({ owner: "worker", healthy: true });
    expect(await worker.exited).toBe(0);
    expect(await new Response(worker.stderr).text()).toContain("durdu ticks=2");
    const probe = Bun.spawnSync({ cmd: [process.execPath, "-e", 'import {getAutomationRuntime} from "./src/server/dashboard.ts"; console.log(JSON.stringify(getAutomationRuntime()));'], env, stdout: "pipe", stderr: "pipe" });
    expect(probe.exitCode, probe.stderr.toString()).toBe(0);
    expect(JSON.parse(probe.stdout.toString())).toMatchObject({ owner: "none", healthy: false });
  } finally {
    worker.kill();
    await worker.exited;
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
