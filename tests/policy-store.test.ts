import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("policy kills are owner-scoped, versioned, audited, and fail closed on reply evidence without official IDs", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-policy-store-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import assert from "node:assert/strict";
        import { ensureDatabase, getCategories } from "./src/server/db.ts";
        import { runAsOwner } from "./src/server/owner-context.ts";
        import { connectXAccount } from "./src/server/x-oauth-store.ts";
        import { getEffectivePolicyKills, listPolicyKillAudit, listPolicyKillControls, recordOfficialReplySummon, setPolicyKillControl } from "./src/server/policy-store.ts";
        assert.equal(ensureDatabase(), true);
        const account = connectXAccount({ownerUserId:"owner-a",xUserId:"501001",handle:"policy_a",displayName:"A",accessToken:"fixture",refreshToken:"fixture",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"],now:10});
        const category = getCategories()[0].slug;
        const first = runAsOwner("owner-a", () => setPolicyKillControl({scope:"account",value:account.accountId,enabled:true,expectedVersion:0,reason:"pause this account",now:11}));
        assert.equal(first.version,1);
        assert.throws(() => runAsOwner("owner-a", () => setPolicyKillControl({scope:"account",value:account.accountId,enabled:false,expectedVersion:0,reason:"stale",now:12})), /version conflict/);
        runAsOwner("owner-a", () => setPolicyKillControl({scope:"category",value:category,enabled:true,expectedVersion:0,reason:"pause category",now:12}));
        assert.deepEqual(runAsOwner("owner-a", () => getEffectivePolicyKills({accountId:account.accountId,category,action:"post"})), {global:false,account:true,category:true,actions:[]});
        assert.deepEqual(runAsOwner("owner-b", () => listPolicyKillControls()), []);
        assert.throws(() => runAsOwner("owner-b", () => setPolicyKillControl({scope:"account",value:account.accountId,enabled:true,expectedVersion:0,reason:"intrusion",now:13})), /account not found/);
        assert.equal(runAsOwner("owner-a", () => listPolicyKillAudit()).length, 2);
        assert.throws(() => runAsOwner("owner-a", () => recordOfficialReplySummon({accountId:account.accountId,connectedXUserId:"501001",kind:"mention",post:{id:"",author_id:"501002"},observedAt:12})), /evidence is invalid/);
        console.log("ok");
      `],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_SECRET_KEY: "policy-store-fixture-key-not-production" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe("ok");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
