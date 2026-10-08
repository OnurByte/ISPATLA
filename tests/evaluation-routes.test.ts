import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("evaluation routes require an owner, scope reads, and persist immutable labels with session identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-evaluation-routes-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import assert from "node:assert/strict";
        import { Database } from "bun:sqlite";
        const origin="http://localhost:3000";
        const request=(path,method="GET",{body,cookie,requestOrigin=origin}={})=>new Request(origin+path,{method,headers:{...(requestOrigin?{origin:requestOrigin}:{}),...(cookie?{cookie}:{}),...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const [authRoute,evaluationRoute]=await Promise.all([import("./src/app/api/auth/[...all]/route.ts"),import("./src/app/api/evaluation/route.ts")]);
        const cookieOf=(response)=>(response.headers.getSetCookie?.()||[response.headers.get("set-cookie")||""]).map(v=>v.split(";",1)[0]).filter(Boolean).join("; ");
        const authRequest=(path,body)=>new Request(origin+"/api/auth"+path,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
        const signup=async(email,password)=>{
          const signup=await authRoute.POST(authRequest("/sign-up/email",{email,password}));assert.equal(signup.status,200,await signup.clone().text());
          const signin=await authRoute.POST(authRequest("/sign-in/email",{email,password}));assert.equal(signin.status,200,await signin.clone().text());
          return {id:(await signup.json()).user.id,cookie:cookieOf(signin)};
        };
        const a=await signup("eval-owner@example.test","correct-horse-battery-a");
        const b=await signup("eval-other@example.test","correct-horse-battery-b");
        const {runAsOwner}=await import("./src/server/owner-context.ts");
        const db=await import("./src/server/db.ts");const store=await import("./src/server/evaluation-store.ts");
        const accountA=runAsOwner(a.id,()=>db.saveAccount({accountKey:"eval-owner",handle:"eval_owner",displayName:"Evaluation Owner",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
        const accountB=runAsOwner(b.id,()=>db.saveAccount({accountKey:"eval-other",handle:"eval_other",displayName:"Evaluation Other",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:10,capabilities:["post"],now:10}));
        const now=Math.floor(Date.now()/1000);
        const prediction=runAsOwner(a.id,()=>store.recordEvaluationPrediction({accountId:String(accountA.id),candidateId:"candidate-owner",leakageGroup:"group-owner",modelKey:"selector-v3",rawScore:81,selectorVersion:"selector-v3",selectionPropensity:null,action:"post",category:"technology",format:"post",riskTier:"unknown",features:{decision:"below_threshold",reason:"score below threshold"},createdAt:now-300,resolveBy:now-10}));
        const unobserved=runAsOwner(a.id,()=>store.recordEvaluationPrediction({accountId:String(accountA.id),candidateId:"candidate-unobserved",leakageGroup:"group-unobserved",modelKey:"selector-v3",rawScore:42,selectorVersion:"selector-v3",action:"post",category:"technology",format:"post",riskTier:"unknown",features:{decision:"expired"},createdAt:now-290,resolveBy:now-5}));
        runAsOwner(a.id,()=>store.appendObservedOutcome({predictionId:prediction.id,capturedAt:now-1,observedAt:now-2,metrics:{views:null,likes:2,replies:null,reposts:null,quotes:null},censored:["views"],source:"official_x_api",provenanceRef:"fixture-observation"}));
        runAsOwner(b.id,()=>store.recordEvaluationPrediction({accountId:String(accountB.id),candidateId:"candidate-other",leakageGroup:"group-other",modelKey:"selector-v3",rawScore:55,selectorVersion:"selector-v3",action:"post",category:"technology",format:"post",riskTier:"low",features:{decision:"eligible"},createdAt:now-300,resolveBy:now-10}));
        const get=(cookie,accountId,modelKey="")=>evaluationRoute.GET(request("/api/evaluation"+(accountId?"?accountId="+accountId+(modelKey?"&modelKey="+encodeURIComponent(modelKey):""):""),"GET",{cookie}));
        const anon=await get(undefined,String(accountA.id));assert.equal(anon.status,401);
        const owner=await get(a.cookie,String(accountA.id));assert.equal(owner.status,200);
        const projected=await owner.json();assert.equal(projected.predictions.length,2);assert.equal(projected.predictions.find(row=>row.id===prediction.id).due,true);assert.equal(projected.predictions.find(row=>row.id===prediction.id).selectionPropensity,null);assert.equal(projected.predictions.find(row=>row.id===prediction.id).calibratedProbability,null);assert.equal(projected.predictions.find(row=>row.id===prediction.id).outcomes[0].metrics.views,null);assert.deepEqual(projected.predictions.find(row=>row.id===prediction.id).outcomes[0].censored,["views"]);assert.deepEqual(projected.predictions.find(row=>row.id===unobserved.id).outcomes,[]);assert.equal(projected.calibration,null);assert.deepEqual(projected.replays,[]);
        const cross=await get(b.cookie,String(accountA.id));assert.equal(cross.status,404);
        const unknown=await get(a.cookie,"999999999");assert.equal(unknown.status,404);
        const payload={action:"label",predictionId:prediction.id,label:"hit",reviewerRef:"attacker-supplied-reviewer"};
        const hostile=await evaluationRoute.POST(request("/api/evaluation","POST",{cookie:a.cookie,requestOrigin:"https://attacker.invalid",body:payload}));assert.equal(hostile.status,403);
        const foreign=await evaluationRoute.POST(request("/api/evaluation","POST",{cookie:b.cookie,body:payload}));assert.equal(foreign.status,404);
        const saved=await evaluationRoute.POST(request("/api/evaluation","POST",{cookie:a.cookie,body:payload}));assert.equal(saved.status,200,await saved.clone().text());
        const duplicate=await evaluationRoute.POST(request("/api/evaluation","POST",{cookie:a.cookie,body:{...payload,label:"miss"}}));assert.equal(duplicate.status,409);
        const replay=await evaluationRoute.POST(request("/api/evaluation","POST",{cookie:a.cookie,body:{action:"replay",accountId:String(accountA.id),modelKey:"selector-v3"}}));assert.equal(replay.status,200);const replayBody=await replay.json();assert.equal(replayBody.calibration.status,"insufficient");assert.equal(replayBody.holdout.status,"insufficient");
        const sql=new Database(process.env.ISPATLA_DB);const label=sql.query("SELECT label,reviewer_ref FROM evaluation_labels WHERE prediction_id=?").get(prediction.id);sql.close();
        assert.deepEqual(label,{label:"hit",reviewer_ref:a.id});
        const after=await get(a.cookie,String(accountA.id),"selector-v3");const afterBody=await after.json();assert.equal(afterBody.predictions.find(row=>row.id===prediction.id).label,"hit");assert.equal(afterBody.calibration.status,"insufficient");assert.equal(afterBody.predictions.every(row=>row.calibratedProbability===null),true);
        console.log(JSON.stringify({anonymous:anon.status,owner:owner.status,crossUser:cross.status,unknownAccount:unknown.status,hostileOrigin:hostile.status,foreignLabel:foreign.status,saved:saved.status,duplicate:duplicate.status,insufficientCalibration:replayBody.calibration.status,reviewerBoundToSession:true,noOutcomeInvented:true}));
      `],
      cwd: process.cwd(),
      env: {
        ...process.env, NODE_ENV: "test", ISPATLA_DB: database, ISPATLA_SECRET_KEY: "test-vault-secret-with-sufficient-entropy",
        ISPATLA_TOKEN_KEY_CURRENT: "evaluation-route-test-key", BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000", ISPATLA_PRIVATE_BETA: "1", ISPATLA_OPERATOR_USER_ID: "not-a-test-user",
      },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({ anonymous: 401, owner: 200, crossUser: 404, unknownAccount: 404, hostileOrigin: 403, foreignLabel: 404, saved: 200, duplicate: 409, insufficientCalibration: "insufficient", reviewerBoundToSession: true, noOutcomeInvented: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
