import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(script:string):string{
  const directory=mkdtempSync(join(tmpdir(),"ispatla-official-worker-owner-"));
  try{
    const result=Bun.spawnSync({cmd:[process.execPath,"-e",script],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:join(directory,"state.sqlite3"),ISPATLA_TOKEN_KEY_CURRENT:"test-only-owner-runtime-key-not-a-provider"},stdout:"pipe",stderr:"pipe"});
    if(result.exitCode!==0)throw new Error(new TextDecoder().decode(result.stderr));
    return new TextDecoder().decode(result.stdout).trim();
  }finally{rmSync(directory,{recursive:true,force:true});}
}

test("automatic account preparation reads persisted account AI routes only inside each owner and requires current X Auto post consent",()=>{
  const result=JSON.parse(run(`
    import {runAsOwner,currentOwnerId} from "./src/server/owner-context.ts";
    import {ensureDatabase,getAccounts,getAccountCategoryConfigs,getCategories,saveAccountCategoryConfig} from "./src/server/db.ts";
    import {getAiSettings,setAiSettings} from "./src/server/ai.ts";
    import {connectXAccount,setAutomationConsent} from "./src/server/x-oauth-store.ts";
    import {withPersistedAccountOwner,resolveAccountAiRoute,hasCurrentAutomaticPostConsent} from "./src/server/pipeline.ts";
    import {X_POLICY_VERSION,X_CONSENT_COPY_VERSION} from "./src/server/x-policy.ts";
    ensureDatabase();const scopes=["tweet.read","tweet.write","users.read","media.write","offline.access"];
    const category=getCategories().find(item=>item.enabled);if(!category)throw new Error("category fixture unavailable");
    function setup(owner,handle,xid,provider,model){
      const linked=connectXAccount({ownerUserId:owner,xUserId:xid,handle,displayName:handle,accessToken:"sealed-test-access",refreshToken:"sealed-test-refresh",expiresAt:999999,scopes,now:10});
      setAutomationConsent({accountId:linked.accountId,ownerUserId:owner,action:"post",mode:"auto",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:5,cadenceSeconds:900,expectedVersion:1,now:11});
      return runAsOwner(owner,()=>{const account=getAccounts().find(item=>item.id===linked.accountId);if(!account)throw new Error("persisted account missing");setAiSettings(provider,model);saveAccountCategoryConfig({accountId:linked.accountId,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{writingProvider:provider,writingModel:model}});return linked.accountId;});
    }
    const a=setup("owner-a","alpha","10001","api","gpt-5.6-luna");
    const b=setup("owner-b","beta","10002","codex","codex-mini-latest");
    function inspect(owner,accountId){return withPersistedAccountOwner(accountId,owner,account=>{const config=getAccountCategoryConfigs().find(item=>item.accountId===account.id);return {owner:currentOwnerId(),provider:getAiSettings().provider,model:getAiSettings().model,route:resolveAccountAiRoute(account,config,"writing"),auto:hasCurrentAutomaticPostConsent(account,12)}})}
    const outputA=inspect("owner-a",a),outputB=inspect("owner-b",b);
    const foreign=(()=>{try{return withPersistedAccountOwner(a,"owner-b",()=>"allowed")}catch(error){return String(error)}})();
    console.log(JSON.stringify({outputA,outputB,foreign}));
  `));
  expect(result.outputA.owner).toBe("owner-a");expect(result.outputA.provider).toBe("api");expect(result.outputA.model).toBe("gpt-5.6-luna");expect(result.outputA.route.provider).toBe("api");expect(result.outputA.auto).toBe(true);
  expect(result.outputB.owner).toBe("owner-b");expect(result.outputB.provider).toBe("codex");expect(result.outputB.model).toBe("codex-mini-latest");expect(result.outputB.route.provider).toBe("codex");expect(result.outputB.auto).toBe(true);
  expect(result.foreign).toContain("account not found");
});
