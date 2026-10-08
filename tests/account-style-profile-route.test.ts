import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("account PATCH validates changed style fields while preserving unchanged legacy profile data", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-account-style-route-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import assert from "node:assert/strict";
        const base="http://localhost:3000";
        const cookieOf=(response)=>{const values=response.headers.getSetCookie?.()||[response.headers.get("set-cookie")||""];return values.map((value)=>value.split(";",1)[0]).filter(Boolean).join("; ")};
        const authRoute=await import("./src/app/api/auth/[...all]/route.ts");
        const accountRoute=await import("./src/app/api/accounts/[id]/route.ts");
        const {ensureDatabase,saveAccount,getAccounts}=await import("./src/server/db.ts");
        const {runAsOwner}=await import("./src/server/owner-context.ts");
        ensureDatabase();
        const signup=async(email,password)=>{
          const signUp=await authRoute.POST(new Request(base+"/api/auth/sign-up/email",{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify({email,password})}));
          assert.equal(signUp.status,200,await signUp.clone().text());
          const signIn=await authRoute.POST(new Request(base+"/api/auth/sign-in/email",{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify({email,password})}));
          assert.equal(signIn.status,200,await signIn.clone().text());
          return {id:(await signUp.json()).user.id,cookie:cookieOf(signIn)};
        };
        const owner=await signup("style-owner@example.test","correct-horse-battery-style");
        const other=await signup("style-other@example.test","correct-horse-battery-other");
        const account=runAsOwner(owner.id,()=>saveAccount({accountKey:"legacy",handle:"legacy_fixture",displayName:"Legacy",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:12,capabilities:["post"],styleProfile:{tone:"sade",purpose:{legacy:true},editorialInstruction:"Eski yönerge"},now:10}));
        const request=(body,cookie=owner.cookie)=>new Request(base+"/api/accounts/"+account.id,{method:"PATCH",headers:{origin:base,cookie,"content-type":"application/json"},body:JSON.stringify(body)});
        const context={params:Promise.resolve({id:String(account.id)})};
        const legacy=runAsOwner(owner.id,()=>getAccounts()[0].styleProfile);
        const accepted=await accountRoute.PATCH(request({styleProfile:{...legacy,tone:"doğrudan",editorialInstruction:"Yeni yönerge"}}),context);
        assert.equal(accepted.status,200,await accepted.clone().text());
        assert.deepEqual((await accepted.json()).styleProfile,{...legacy,tone:"doğrudan",editorialInstruction:"Yeni yönerge"});
        const rejectedPolicy=await accountRoute.PATCH(request({styleProfile:{...legacy,publishWithoutReview:true}}),context);
        const rejectedLegacyEdit=await accountRoute.PATCH(request({styleProfile:{...legacy,purpose:{legacy:false}}}),context);
        const rejectedUnknown=await accountRoute.PATCH(request({styleProfile:{...legacy,newExtension:"not allowed"}}),context);
        const rejectedSchema=await accountRoute.PATCH(request({styleProfile:{...legacy,tone:42}}),context);
        const anonymous=await accountRoute.PATCH(request({styleProfile:legacy},""),context);
        const crossOwner=await accountRoute.PATCH(request({styleProfile:legacy,enabled:false},other.cookie),context);
        assert.deepEqual([rejectedPolicy.status,rejectedLegacyEdit.status,rejectedUnknown.status,rejectedSchema.status,anonymous.status,crossOwner.status],[422,422,422,422,401,404]);
        console.log(JSON.stringify({accepted:accepted.status,rejections:[rejectedPolicy.status,rejectedLegacyEdit.status,rejectedUnknown.status,rejectedSchema.status],anonymous:anonymous.status,crossOwner:crossOwner.status}));
      `],
      cwd: process.cwd(),
      env: {
        ...process.env, NODE_ENV: "test", ISPATLA_DB: database, ISPATLA_SECRET_KEY: "test-vault-secret-with-sufficient-entropy",
        ISPATLA_TOKEN_KEY_CURRENT: "account-style-route-test-token-key", BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000", ISPATLA_PRIVATE_BETA: "1", ISPATLA_OPERATOR_USER_ID: "not-a-test-user",
      },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
      accepted: 200, rejections: [422, 422, 422, 422], anonymous: 401, crossOwner: 404,
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
