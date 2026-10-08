import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runIsolatedDatabase(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-phase0-radar-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("nested X metrics survive normalization and snapshots preserve missing versus zero", () => {
  const output = JSON.parse(runIsolatedDatabase(`
    import { ensureDatabase, postMetricSnapshot, recordPostMetricSnapshot } from "./src/server/db.ts";
    import { observedPost } from "./src/server/pipeline.ts";
    import { normalizeFxPost } from "./src/server/x-reader.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const post = normalizeFxPost({
      id: "123", text: "metrics test", created_timestamp: 1749999990,
      author: { screen_name: "source", followers: 10 },
      likes: 99,
      metrics: { likes: 0, replies: 2, retweets: 3, views: 100 },
    });
    if (!post) throw new Error("post did not normalize");
    const observed = observedPost("source", post);
    recordPostMetricSnapshot(observed, 1750000000);
    console.log(JSON.stringify({ post, raw: JSON.parse(observed.rawJson), snapshot: postMetricSnapshot("123") }));
  `));
  expect(output.post.metrics).toMatchObject({ likes: 0, replies: 2, reposts: 3, views: 100, quality: "partial" });
  expect(output.raw.likes).toBe(0);
  expect(output.raw.quotes).toBeUndefined();
  expect(output.snapshot).toMatchObject({ likes: 0, replies: 2, reposts: 3, quotes: null, views: 100, quality: "partial" });
});

test("ordinary new observations do not start radar burst cadence, while hits do", () => {
  const output = JSON.parse(runIsolatedDatabase(`
    import { ensureDatabase, getMonitorTargets, upsertMonitorTarget } from "./src/server/db.ts";
    import { runMonitorTarget } from "./src/server/monitoring.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const now = Math.floor(Date.now() / 1000);
    const previousFetch = globalThis.fetch;
    let likes = 1;
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{
      id: "123", text: "ordinary radar result", created_timestamp: now - 10,
      author: { screen_name: "source", followers: 10000 },
      likes, replies: 0, reposts: 0, quotes: 0, views: 1,
    }] }))) as typeof fetch;
    try {
      const target = upsertMonitorTarget({ kind: "keyword", key: "phase0", query: "phase0", now });
      const ordinary = await runMonitorTarget(target, now);
      const afterOrdinary = getMonitorTargets({ kind: "keyword" })[0];
      likes = 100000;
      const hitTarget = upsertMonitorTarget({ kind: "keyword", key: "phase0-hit", query: "phase0", now });
      const hit = await runMonitorTarget(hitTarget, now);
      const afterHit = getMonitorTargets({ kind: "keyword" }).find((item) => item.key === "phase0-hit");
      console.log(JSON.stringify({ now, ordinary, ordinaryBurst: afterOrdinary.burstUntil, hit, hitBurst: afterHit?.burstUntil }));
    } finally {
      globalThis.fetch = previousFetch;
    }
  `));
  expect(output.ordinary.uniqueResults).toBe(1);
  expect(output.ordinaryBurst).toBe(0);
  expect(output.hit.hits).toBe(1);
  expect(output.hitBurst).toBe(output.now + 600);
});
