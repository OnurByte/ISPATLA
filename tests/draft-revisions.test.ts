import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("draft revisions snapshot content changes, ignore status-only writes, and stay owner scoped", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-draft-revisions-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import { ensureDatabase, createDraft, updateDraft } from "./src/server/db.ts";
        import { runAsOwner } from "./src/server/owner-context.ts";
        import { ensureDraftRevisionStore, getDraftRevisions } from "./src/server/draft-revisions.ts";
        ensureDatabase(); ensureDraftRevisionStore();
        const draft = runAsOwner("owner-a", () => createDraft({ externalId: "", format: "post", text: "v1", now: 10 }));
        runAsOwner("owner-a", () => updateDraft({ id: draft.id, status: "queued", now: 11 }));
        runAsOwner("owner-a", () => updateDraft({ id: draft.id, text: "v2", now: 12 }));
        runAsOwner("owner-a", () => updateDraft({ id: draft.id, sourceHandle: "verified-source", sourceUrl: "https://x.com/verified-source/status/123", now: 13 }));
        const ownerA = runAsOwner("owner-a", () => getDraftRevisions(draft.id));
        const ownerB = runAsOwner("owner-b", () => getDraftRevisions(draft.id));
        console.log(JSON.stringify({ ownerA: ownerA.map(({ revision, text,sourceHandle,sourceUrl }) => ({ revision, text,sourceHandle,sourceUrl })), ownerB }));
      `],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
      ownerA: [{revision:3,text:"v2",sourceHandle:"verified-source",sourceUrl:"https://x.com/verified-source/status/123"},{ revision: 2, text: "v2",sourceHandle:"",sourceUrl:"" }, { revision: 1, text: "v1",sourceHandle:"",sourceUrl:"" }],
      ownerB: [],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
