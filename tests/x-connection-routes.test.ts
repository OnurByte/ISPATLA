import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("X connection routes require real sessions, enforce owner boundaries, and keep connection metadata safe", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-x-connection-routes-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import assert from "node:assert/strict";
        const origin = "http://localhost:3000";
        const request = (path, method="GET", {body,cookie,requestOrigin=origin}={}) => new Request(origin+path, {
          method, headers:{ ...(requestOrigin ? {origin:requestOrigin}:{}), ...(cookie?{cookie}:{}), ...(body===undefined?{}:{"content-type":"application/json"}) },
          ...(body===undefined?{}:{body:JSON.stringify(body)}),
        });
        const context = (id) => ({params:Promise.resolve({id:String(id)})});
        const [authRoute,startRoute,connectionRoute,consentRoute] = await Promise.all([
          import("./src/app/api/auth/[...all]/route.ts"),
          import("./src/app/api/x/oauth/start/route.ts"),
          import("./src/app/api/accounts/[id]/connection/route.ts"),
          import("./src/app/api/accounts/[id]/consent/route.ts"),
        ]);
        const {connectXAccount,getXCredential} = await import("./src/server/x-oauth-store.ts");
        const {X_POLICY_VERSION,X_CONSENT_COPY_VERSION} = await import("./src/server/x-policy.ts");
        const cookieOf=(response)=> (response.headers.getSetCookie?.()||[response.headers.get("set-cookie")||""]).map(v=>v.split(";",1)[0]).filter(Boolean).join("; ");
        const authRequest=(path,body,cookie)=>new Request(origin+"/api/auth"+path,{method:body===undefined?"GET":"POST",headers:{origin,...(cookie?{cookie}:{}),...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const signup=async(email,password)=>{
          const signUp=await authRoute.POST(authRequest("/sign-up/email",{email,password}));
          assert.equal(signUp.status,200,await signUp.clone().text());
          const signIn=await authRoute.POST(authRequest("/sign-in/email",{email,password}));
          assert.equal(signIn.status,200,await signIn.clone().text());
          return {id:(await signUp.json()).user.id,cookie:cookieOf(signIn)};
        };
        const a=await signup("x-owner@example.test","correct-horse-battery-a");
        const b=await signup("x-other@example.test","correct-horse-battery-b");
        const account=connectXAccount({ownerUserId:a.id,xUserId:"101010",handle:"owner_fixture",displayName:"Owner Fixture",accessToken:"fixture-access-token",refreshToken:"fixture-refresh-token",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"]});
        const getState=(cookie)=>connectionRoute.GET(request("/api/accounts/"+account.accountId+"/connection","GET",{cookie}),context(account.accountId));
        const anonState=await getState(undefined);
        const ownerState=await getState(a.cookie);
        const otherState=await getState(b.cookie);
        assert.equal(anonState.status,401);
        assert.equal(ownerState.status,200);
        const publicState=await ownerState.clone().text();
        assert.equal(publicState.includes("fixture-access-token"),false);
        assert.equal(publicState.includes("fixture-refresh-token"),false);
        assert.equal(publicState.includes("encrypted_access_token"),false);
        assert.equal(otherState.status,404);

        const anonymousStart=await startRoute.POST(request("/api/x/oauth/start","POST",{body:{returnTo:"/app/accounts"}}));
        const ownerStart=await startRoute.POST(request("/api/x/oauth/start","POST",{cookie:a.cookie,body:{returnTo:"/app/accounts"}}));
        assert.equal(anonymousStart.status,401);
        assert.equal(ownerStart.status,400); // no configured X client; no provider call is made

        const consentBody={action:"post",mode:"off",policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,dailyLimit:0,cadenceSeconds:0,expectedVersion:1};
        const anonConsent=await consentRoute.POST(request("/api/accounts/"+account.accountId+"/consent","POST",{body:consentBody}),context(account.accountId));
        const hostileConsent=await consentRoute.POST(request("/api/accounts/"+account.accountId+"/consent","POST",{cookie:a.cookie,requestOrigin:"https://attacker.example",body:consentBody}),context(account.accountId));
        const ownerConsent=await consentRoute.POST(request("/api/accounts/"+account.accountId+"/consent","POST",{cookie:a.cookie,body:consentBody}),context(account.accountId));
        const staleConsent=await consentRoute.POST(request("/api/accounts/"+account.accountId+"/consent","POST",{cookie:a.cookie,body:consentBody}),context(account.accountId));
        const crossConsent=await consentRoute.POST(request("/api/accounts/"+account.accountId+"/consent","POST",{cookie:b.cookie,body:consentBody}),context(account.accountId));
        assert.deepEqual([anonConsent.status,hostileConsent.status,ownerConsent.status,staleConsent.status,crossConsent.status],[401,403,200,409,404]);
        const crossDisconnect=await connectionRoute.DELETE(request("/api/accounts/"+account.accountId+"/connection","DELETE",{cookie:b.cookie}),context(account.accountId));
        assert.equal(crossDisconnect.status,404);
        assert.equal(getXCredential(account.accountId,a.id).accessToken,"fixture-access-token");
        const disconnect=await connectionRoute.DELETE(request("/api/accounts/"+account.accountId+"/connection","DELETE",{cookie:a.cookie}),context(account.accountId));
        assert.equal(disconnect.status,200);
        assert.deepEqual(await disconnect.json(),{disconnected:true,providerRevoked:false});
        assert.equal(getXCredential(account.accountId,a.id).accessToken,"");
        console.log(JSON.stringify({owner:ownerState.status,anonymous:anonState.status,crossUser:otherState.status,start:[anonymousStart.status,ownerStart.status],consent:[anonConsent.status,hostileConsent.status,ownerConsent.status,staleConsent.status,crossConsent.status],disconnect:disconnect.status,metadataRedacted:true}));
      `],
      cwd: process.cwd(),
      env: {
        ...process.env, NODE_ENV: "test", ISPATLA_DB: database, ISPATLA_SECRET_KEY: "test-vault-secret-with-sufficient-entropy",
        ISPATLA_TOKEN_KEY_CURRENT: "connection-route-test-token-key", BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000", ISPATLA_PRIVATE_BETA: "1", ISPATLA_OPERATOR_USER_ID: "not-a-test-user",
      },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
      owner: 200, anonymous: 401, crossUser: 404, start: [401, 400], consent: [401, 403, 200, 409, 404], disconnect: 200, metadataRedacted: true,
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
