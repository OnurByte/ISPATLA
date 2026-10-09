import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";

// An isolated disposable database prevents demo state from becoming real evidence.
const port=Number(process.env.ISPATLA_DEMO_PORT || 3108);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid demo port");
const origin=`http://localhost:${port}`;
const directory=mkdtempSync(join(tmpdir(),"ispatla-demo-"));
Object.assign(process.env,{NODE_ENV:"development",ISPATLA_DEMO:"1",ISPATLA_DB:join(directory,"demo.sqlite3"),BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),ISPATLA_PRIVATE_BETA:"1",ISPATLA_AUTOMATION:"0",ISPATLA_SECRET_KEY:randomBytes(32).toString("hex"),ISPATLA_SOURCES:join(directory,"sources.json")});
const {createAuthRuntime}=await import("../src/server/auth");
const {ensureDatabase,saveAccount,createDraft,upsertPost}=await import("../src/server/db");
const {runAsOwner}=await import("../src/server/owner-context");
const {FixtureXReader,FixtureXPublisher}=await import("../src/server/fixture-x");
const {observedPost,persistShadowObservation}=await import("../src/server/pipeline");
const auth=await createAuthRuntime({env:process.env,validateSignupEmail:async(email)=>({accepted:true,normalizedEmail:email,mxStatus:"unknown"})});
let child:ReturnType<typeof Bun.spawn>|undefined;
try {
  if(!ensureDatabase())throw new Error("Demo database initialization failed");
  const response=await auth.handler(new Request(origin+"/api/auth/sign-up/email",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({email:"demo@example.test",password:"demo-password-123456"})}));
  if(!response.ok)throw new Error("Demo session user initialization failed");
  const {user}=await response.json() as {user:{id:string}};
  const reader=new FixtureXReader();const publisher=new FixtureXPublisher();
  const post=await reader.fetchPostMetrics({externalId:"1000000000000000001"});
  const observed=observedPost("demo_source",post);
  upsertPost(observed,1700000060);persistShadowObservation(post,observed.clusterKey,1700000060);
  runAsOwner(user.id,()=>{
    const account=saveAccount({accountKey:"demo",handle:"demo_account",displayName:"Demo account · synthetic",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:1,capabilities:[],now:1700000060});
    createDraft({externalId:post.id,accountId:account.id,format:"post",text:"Demo draft: review the original dataset and its limitations before sharing.",now:1700000060});
  });
  const receipt=await publisher.publishPost({text:"Simulated fixture receipt; no X request was made."});
  console.log(`DEMO ONLY · isolated disposable database · publishing disabled\nLogin: demo@example.test / demo-password-123456\n${origin}/login\nSimulated receipt: ${receipt.id}`);
  if(process.argv.includes("--seed-only")){console.log(JSON.stringify({demo:true,remoteWrites:0,simulatedReceipt:receipt.id}));}
  else {
    child=Bun.spawn(["node","node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(port)],{env:process.env,stdout:"inherit",stderr:"inherit"});
    const stop=()=>child?.kill();process.once("SIGINT",stop);process.once("SIGTERM",stop);
    process.exitCode=await child.exited;
  }
} finally {if(child&&child.exitCode===null){child.kill();await child.exited;}auth.close();rmSync(directory,{recursive:true,force:true});}
