import {expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('user owners require their own provider keys and an official X grant',()=>{
 const directory=mkdtempSync(join(tmpdir(),'ispatla-provider-owner-'));
 try{
 const result=Bun.spawnSync({cmd:[process.execPath,'-e',`
 import assert from 'node:assert/strict';
 import {ensureDatabase,saveAccount} from './src/server/db.ts';
 import {runAsOwner} from './src/server/owner-context.ts';
 import {secretOrEnv,saveSecret} from './src/server/vault.ts';
 import {withOfficialAccount} from './src/server/publisher.ts';
 assert.ok(ensureDatabase());
 const keys=()=>({openai:secretOrEnv('openai_api_key','OPENAI_API_KEY'),jev:secretOrEnv('jev_api_key','JEV_API_KEY')});
 assert.deepEqual(runAsOwner('ordinary',keys),{openai:null,jev:null});
 assert.deepEqual(runAsOwner('operator',keys),{openai:'deployment-openai',jev:'deployment-jev'});
 assert.deepEqual(keys(),{openai:'deployment-openai',jev:'deployment-jev'});
 runAsOwner('ordinary',()=>{saveSecret('openai_api_key','openai','own-openai',1);saveSecret('jev_api_key','jev','own-jev',1);assert.deepEqual(keys(),{openai:'own-openai',jev:'own-jev'});});
 const account=runAsOwner('ordinary',()=>saveAccount({accountKey:'ordinary',handle:'ordinary',displayName:'',enabled:true,defaultAccount:true,automationMode:'manual',dailyLimit:24,capabilities:[],now:1}));
 let called=false;
 await assert.rejects(runAsOwner('ordinary',()=>withOfficialAccount(account,async()=>{called=true;})),/reauthorization/);
 await assert.rejects(runAsOwner('other',()=>withOfficialAccount(account,async()=>{called=true;})),/owner context/);
 assert.equal(called,false);console.log('provider owner boundaries passed');
 `],env:{...process.env,ISPATLA_DB:join(directory,'state.sqlite3'),ISPATLA_SECRET_KEY:'fixture-vault-key',ISPATLA_OPERATOR_USER_ID:'operator',OPENAI_API_KEY:'deployment-openai',JEV_API_KEY:'deployment-jev'},stdout:'pipe',stderr:'pipe'});
 expect(result.exitCode,result.stderr.toString()).toBe(0);expect(result.stdout.toString()).toContain('provider owner boundaries passed');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
