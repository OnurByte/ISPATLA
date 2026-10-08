import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("dashboard draft previews are bounded, owner-scoped and omit private generation context", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-dashboard-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { ensureDatabase, createDraft } from "./src/server/db.ts";
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { getDashboardSummary } from "./src/server/dashboard.ts";
      if (!ensureDatabase()) throw new Error("database initialization failed");
      runAsOwner("dashboard-a", () => {
        for (let i=1;i<=4;i++) createDraft({externalId:"",format:"post",text:"own-"+i,prompt:"private-generation-context",now:i});
      });
      runAsOwner("dashboard-b", () => createDraft({externalId:"",format:"post",text:"other-owner",now:5}));
      const own = runAsOwner("dashboard-a", () => getDashboardSummary().recentDrafts);
      const other = runAsOwner("dashboard-b", () => getDashboardSummary().recentDrafts);
      const anonymous = getDashboardSummary().recentDrafts;
      console.log(JSON.stringify({own,other,anonymous}));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.own.map((draft: { text: string }) => draft.text)).toEqual(["own-4", "own-3", "own-2"]);
    expect(output.other.map((draft: { text: string }) => draft.text)).toEqual(["other-owner"]);
    expect(output.anonymous).toEqual([]);
    expect(Object.keys(output.own[0]).sort()).toEqual(["id", "status", "text"]);
    expect(JSON.stringify(output)).not.toContain("private-generation-context");
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30_000);
