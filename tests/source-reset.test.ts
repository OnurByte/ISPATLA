import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("source registry reset", () => {
  test("restores configured sources and keeps removal history", () => {
    const directory = mkdtempSync(join(tmpdir(), "ispatla-source-reset-"));
    const database = join(directory, "state.sqlite3");
    const config = join(directory, "sources.json");
    writeFileSync(config, JSON.stringify({ sources: [{ handle: "defaultsource", name: "Default Source", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "seed", status: "active", pinned: false } }] }));
    try {
      const result = Bun.spawnSync({
        cmd: [process.execPath, "-e", `
          process.env.ISPATLA_SOURCES = ${JSON.stringify(config)};
          const db = await import("./src/server/db.ts");
          const sources = await import("./src/server/sources.ts");
          if (!db.ensureDatabase()) throw new Error("database did not initialize");
          const now = 2000000;
          db.upsertSource({ handle: "customsource", name: "Custom", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active", pinned: true } }, now);
          db.recordSourceEvent({ handle: "customsource", event: "deleted", score: 0, reason: "manual delete", model: "", now });
          db.recordSourceEvent({ handle: "defaultsource", event: "deleted", score: 0, reason: "manual delete", model: "", now });
          const restored = sources.resetSources(now + 1);
          console.log(JSON.stringify({ handles: restored.map((source) => source.handle), deleted: db.getDeletedSources().map((source) => source.handle), suppression: db.sourceWasDeletedSince("customsource", now) }));
        `],
        cwd: process.cwd(),
        env: { ...process.env, ISPATLA_DB: database },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
      const output = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) || "{}";
      expect(JSON.parse(output)).toMatchObject({ handles: ["defaultsource"], deleted: ["customsource"], suppression: true });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("syncs the AI X seed list into an initialized DB and drops auto-discovered candidates", () => {
    const directory = mkdtempSync(join(tmpdir(), "ispatla-source-sync-"));
    const database = join(directory, "state.sqlite3");
    const config = join(directory, "sources.json");
    writeFileSync(config, JSON.stringify({ sources: [{ handle: "aipublisher", name: "AI Publisher", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "seed", status: "active", pinned: false } }] }));
    try {
      const result = Bun.spawnSync({
        cmd: [process.execPath, "-e", `
          process.env.ISPATLA_SOURCES = ${JSON.stringify(config)};
          const db = await import("./src/server/db.ts");
          const sources = await import("./src/server/sources.ts");
          if (!db.ensureDatabase()) throw new Error("database did not initialize");
          const now = 2000000;
          db.setSetting("sources_seed_v1", "done", now);
          db.setSetting("sources_ai_pool_v2", "done", now);
          db.upsertSource({ handle: "legacyseed", name: "Legacy", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "seed", status: "active" } }, now);
          db.upsertSource({ handle: "junkhandle", name: "Junk", enabled: false, maxPosts: 20, rightsStatus: "unknown", profile: { status: "candidate", evidenceWeight: 1 } }, now);
          db.upsertSource({ handle: "junkactive", name: "Junk Active", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "discovered", status: "active" } }, now);
          db.upsertSource({ handle: "manualhandle", name: "Manual", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active" } }, now);
          sources.bootstrapSources(now + 1);
          db.upsertSource({ handle: "latejunk", name: "Late junk", enabled: false, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "discovered", status: "candidate" } }, now + 2);
          sources.bootstrapSources(now + 3);
          console.log(JSON.stringify({ sources: db.getStoredSources().map((item) => item.handle).sort(), marker: db.getSetting("sources_ai_pool_v3") }));
        `],
        cwd: process.cwd(),
        env: { ...process.env, ISPATLA_DB: database },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
      const output = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) || "{}";
      expect(JSON.parse(output)).toMatchObject({ sources: ["aipublisher", "manualhandle"], marker: "done" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("cleans old discovered candidates before first seed import", () => {
    const directory = mkdtempSync(join(tmpdir(), "ispatla-source-first-seed-"));
    const database = join(directory, "state.sqlite3");
    const config = join(directory, "sources.json");
    writeFileSync(config, JSON.stringify({ sources: [{ handle: "aipublisher", name: "AI Publisher", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "seed", status: "active", pinned: false } }] }));
    try {
      const result = Bun.spawnSync({
        cmd: [process.execPath, "-e", `
          process.env.ISPATLA_SOURCES = ${JSON.stringify(config)};
          const db = await import("./src/server/db.ts");
          const sources = await import("./src/server/sources.ts");
          if (!db.ensureDatabase()) throw new Error("database did not initialize");
          const now = 2000000;
          db.upsertSource({ handle: "junkhandle", name: "Junk", enabled: false, maxPosts: 20, rightsStatus: "unknown", profile: { status: "candidate", evidenceWeight: 1 } }, now);
          db.upsertSource({ handle: "manualhandle", name: "Manual", enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active" } }, now);
          sources.bootstrapSources(now + 1);
          console.log(JSON.stringify(db.getStoredSources().map((item) => item.handle).sort()));
        `],
        cwd: process.cwd(),
        env: { ...process.env, ISPATLA_DB: database },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
      const output = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) || "[]";
      expect(JSON.parse(output)).toEqual(["aipublisher", "manualhandle"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
