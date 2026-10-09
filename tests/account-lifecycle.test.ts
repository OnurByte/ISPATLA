import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("owner deletion rolls back and removes only that owner and FK descendants idempotently", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-account-lifecycle-"));
  const databasePath = join(directory, "state.sqlite3");
  const script = `
    import assert from "node:assert/strict";
    import { Database } from "bun:sqlite";
    import { ensureDatabase, deleteOwnerData, isOwnerEnabled } from "./src/server/db.ts";
    assert.equal(ensureDatabase(), true);
    const sqlite = new Database(process.env.ISPATLA_DB!);
    assert.equal(isOwnerEnabled("lifecycle-owner"), false);
    sqlite.exec("CREATE TABLE auth_user_status(owner_user_id TEXT PRIMARY KEY,status TEXT NOT NULL,updated_at INTEGER NOT NULL); INSERT INTO auth_user_status VALUES('lifecycle-owner','active',1),('other-owner','disabled',1);");
    assert.equal(isOwnerEnabled("lifecycle-owner"), true);
    assert.equal(isOwnerEnabled("other-owner"), false);
    sqlite.exec(\`CREATE TABLE lifecycle_test_parent(id INTEGER PRIMARY KEY, owner_user_id TEXT NOT NULL);
      CREATE TABLE lifecycle_test_child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES lifecycle_test_parent(id));
      INSERT INTO lifecycle_test_parent(owner_user_id) VALUES('lifecycle-owner');
      INSERT INTO lifecycle_test_child(parent_id) VALUES(1);
      INSERT INTO lifecycle_test_parent(owner_user_id) VALUES('other-owner');
      INSERT INTO lifecycle_test_child(parent_id) VALUES(2);
      INSERT INTO secrets(name,provider,ciphertext,updated_at) VALUES
        ('owner:lifecycle-owner:openai','OpenAI','owned-secret',1),
        ('owner:other-owner:openai','OpenAI','other-secret',1),
        ('shared-provider-key','OpenAI','shared-secret',1);
      INSERT INTO app_settings(name,value,updated_at) VALUES
        ('owner:lifecycle-owner:ai_openai_model','owned-model',1),
        ('owner:other-owner:ai_openai_model','other-model',1),
        ('shared-setting','shared',1);
      CREATE TRIGGER lifecycle_test_reject_delete BEFORE DELETE ON lifecycle_test_child
      BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;\`);
    assert.throws(() => deleteOwnerData("lifecycle-owner"));
    assert.equal(sqlite.query("SELECT COUNT(*) AS count FROM lifecycle_test_parent").get().count, 2);
    assert.equal(sqlite.query("SELECT COUNT(*) AS count FROM lifecycle_test_child").get().count, 2);
    sqlite.exec("DROP TRIGGER lifecycle_test_reject_delete;");
    deleteOwnerData("lifecycle-owner");
    deleteOwnerData("lifecycle-owner");
    assert.deepEqual(sqlite.query("SELECT owner_user_id FROM lifecycle_test_parent").all(), [{ owner_user_id: "other-owner" }]);
    assert.equal(sqlite.query("SELECT COUNT(*) AS count FROM lifecycle_test_child").get().count, 1);
    assert.deepEqual(sqlite.query("SELECT name FROM secrets ORDER BY name").all(), [{name:"owner:other-owner:openai"},{name:"shared-provider-key"}]);
    assert.deepEqual(sqlite.query("SELECT name FROM app_settings ORDER BY name").all(), [{name:"owner:other-owner:ai_openai_model"},{name:"post_score_version"},{name:"shared-setting"}]);
    sqlite.close();
  `;
  try {
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: databasePath }, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
