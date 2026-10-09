import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the scheduled account-inference task runs in the shared worker and records its outcome", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-scheduled-inference-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { ensureDatabase, getAutomationSchedules, getOwnAccountInference, saveAutomationSchedule } from "./src/server/db.ts";
      import { Database } from "bun:sqlite";
      import { connectXAccount } from "./src/server/x-oauth-store.ts";
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { OfficialXClient } from "./src/server/official-x.ts";
      import { runScheduledAutomationTasks } from "./src/server/automation-scheduler.ts";
      if (!ensureDatabase()) throw new Error("database unavailable");
      const now = 2000;
      const auth = new Database(process.env.ISPATLA_DB);
      auth.exec("CREATE TABLE auth_user_status(owner_user_id TEXT PRIMARY KEY,status TEXT NOT NULL,updated_at INTEGER NOT NULL)");
      auth.query("INSERT INTO auth_user_status VALUES (?,'active',?)").run("scheduler-owner", now);
      auth.close();
      connectXAccount({ownerUserId:"scheduler-owner",xUserId:"200001",handle:"sched_account",accessToken:"access",refreshToken:"refresh",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"],now});
      saveAutomationSchedule({id:"account_inference",enabled:true,intervalSeconds:300,nextRunAt:now,now:now-1});
      OfficialXClient.prototype.getOwnProfile = async () => ({description:"Linux software developer"});
      OfficialXClient.prototype.getOwnTimeline = async () => [];
      const result = await runScheduledAutomationTasks(now);
      const state = runAsOwner("scheduler-owner",()=>getOwnAccountInference(1));
      console.log(JSON.stringify({result,schedule:getAutomationSchedules(now).find((item)=>item.id==="account_inference"),status:state?.status}));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_TOKEN_KEY_CURRENT: "scheduler-inference-test-key-long-enough", X_OAUTH_CLIENT_ID: "scheduler-test-client", X_OAUTH_REDIRECT_URI: "http://localhost/api/x/oauth/callback" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.result).toMatchObject({ ran: 1, failed: 0, partial: 0 });
    expect(output.result.tasks[0]).toMatchObject({ id: "account_inference", status: "success", counts: { attempted: 1, completed: 1, skipped: 0, failed: 0 } });
    expect(output.schedule).toMatchObject({ id: "account_inference", lastStatus: "success", lastRunAt: expect.any(Number) });
    expect(output.status).toBe("insufficient_evidence");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
