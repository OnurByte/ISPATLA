import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("HTTP routes isolate two authenticated users and reject invalid authority", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-request-auth-"));
  const database = join(directory, "state.sqlite3");
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import assert from "node:assert/strict";
        const base = "http://localhost:3000";
        const json = (response) => response.json();
        const cookieHeader = (response) => {
          const headers = response.headers;
          const values = headers.getSetCookie?.() || [headers.get("set-cookie") || ""];
          return values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
        };
        const authRequest = (path, body, cookie) => new Request(base + "/api/auth" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: { origin: base, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const apiRequest = (path, method = "GET", { body, cookie, origin = base } = {}) => new Request(base + "/api" + path, {
          method,
          headers: { ...(origin ? { origin } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });

        const [authRoute, accounts, accountById, drafts, draftById, draftQueue, jobs, jobById, publications, publicationById, scan, automation, categories, categoryById] = await Promise.all([
          import("./src/app/api/auth/[...all]/route.ts"),
          import("./src/app/api/accounts/route.ts"),
          import("./src/app/api/accounts/[id]/route.ts"),
          import("./src/app/api/drafts/route.ts"),
          import("./src/app/api/drafts/[id]/route.ts"),
          import("./src/app/api/drafts/[id]/queue/route.ts"),
          import("./src/app/api/queue/route.ts"),
          import("./src/app/api/queue/[id]/route.ts"),
          import("./src/app/api/publications/route.ts"),
          import("./src/app/api/publications/[id]/route.ts"),
          import("./src/app/api/scan/route.ts"),
          import("./src/app/api/settings/automation/route.ts"),
          import("./src/app/api/categories/route.ts"),
          import("./src/app/api/categories/[id]/route.ts"),
        ]);
        const db = await import("./src/server/db.ts");
        const { runAsOwner } = await import("./src/server/owner-context.ts");
        const authPOST = authRoute.POST;
        if (!db.ensureDatabase()) throw new Error("application database did not initialize");

        const signup = async (email, password) => {
          const response = await authPOST(authRequest("/sign-up/email", { email, password }));
          assert.equal(response.status, 200, await response.clone().text());
          const body = await json(response);
          const login = await authPOST(authRequest("/sign-in/email", { email, password }));
          assert.equal(login.status, 200, await login.clone().text());
          const cookie = cookieHeader(login);
          assert.ok(cookie, "sign-in must issue a session cookie");
          const session = await authRoute.GET(authRequest("/get-session", undefined, cookie));
          assert.equal((await json(session)).user.id, body.user.id);
          return { id: body.user.id, cookie };
        };

        const a = await signup("alice@example.test", "correct-horse-battery-a");
        const b = await signup("bob@example.test", "correct-horse-battery-b");
        const accountResponse = await accounts.POST(apiRequest("/accounts", "POST", { cookie: a.cookie, body: {
          accountKey: "alice", handle: "alice", displayName: "Alice", enabled: true,
          defaultAccount: true, automationMode: "manual", dailyLimit: 24, capabilities: ["post"],
        } }));
        assert.equal(accountResponse.status, 422, await accountResponse.clone().text());
        const { connectXAccount } = await import("./src/server/x-oauth-store.ts");
        const linkedAccount = connectXAccount({ownerUserId:a.id,xUserId:"101010",handle:"alice",displayName:"Alice",accessToken:"fixture-access",refreshToken:"fixture-refresh",expiresAt:9999999999,scopes:["tweet.read","tweet.write","users.read","media.write","offline.access"]});
        const account=runAsOwner(a.id,()=>db.getAccounts().find(row=>row.id===linkedAccount.accountId));
        const categoryCreate = await categories.POST(apiRequest("/categories", "POST", { cookie: a.cookie, body: { accountId: account.id, slug: "bitcoin", name: "Bitcoin", description: "Bitcoin konu takibi", keywords: ["bitcoin"] } }));
        assert.equal(categoryCreate.status, 201, await categoryCreate.clone().text());
        const customCategory = await json(categoryCreate);
        assert.equal(customCategory.ownerUserId, a.id);
        assert.equal(customCategory.accountId, account.id);
        const visibleCategories = await categories.GET(apiRequest("/categories?accountId=" + account.id, "GET", { cookie: a.cookie })).then(json);
        assert.ok(visibleCategories.some((item) => item.id === customCategory.id));
        const builtInCategory = visibleCategories.find((item) => item.builtIn);
        const builtInEdit = await categoryById.PATCH(apiRequest("/categories/" + builtInCategory.id, "PATCH", { cookie: a.cookie, body: { accountId: account.id, name: "tampered" } }), context(builtInCategory.id));
        assert.equal(builtInEdit.status, 403);
        const foreignCategories = await categories.GET(apiRequest("/categories?accountId=" + account.id, "GET", { cookie: b.cookie }));
        assert.equal(foreignCategories.status, 404);
        const forgedCreate = await categories.POST(apiRequest("/categories", "POST", { cookie: b.cookie, body: { accountId: account.id, slug: "forged", name: "Forged", description: "No access", keywords: ["forged"] } }));
        assert.equal(forgedCreate.status, 400);
        const foreignPatch = await categoryById.PATCH(apiRequest("/categories/" + customCategory.id, "PATCH", { cookie: b.cookie, body: { accountId: account.id, name: "intruded" } }), context(customCategory.id));
        assert.equal(foreignPatch.status, 404);
        const ownerPatch = await categoryById.PATCH(apiRequest("/categories/" + customCategory.id, "PATCH", { cookie: a.cookie, body: { accountId: account.id, name: "Bitcoin tools" } }), context(customCategory.id));
        assert.equal(ownerPatch.status, 200, await ownerPatch.clone().text());
        const foreignDelete = await categoryById.DELETE(apiRequest("/categories/" + customCategory.id, "DELETE", { cookie: b.cookie }), context(customCategory.id));
        assert.equal(foreignDelete.status, 404);
        const ownerDelete = await categoryById.DELETE(apiRequest("/categories/" + customCategory.id, "DELETE", { cookie: a.cookie }), context(customCategory.id));
        assert.equal(ownerDelete.status, 200);

        const draftResponse = await drafts.POST(apiRequest("/drafts", "POST", { cookie: a.cookie, body: { externalId: "", format: "post", text: "A private draft" } }));
        assert.equal(draftResponse.status, 201, await draftResponse.clone().text());
        const draft = await json(draftResponse);
        const intentResponse = await draftQueue.POST(apiRequest("/drafts/" + draft.id + "/queue", "POST", { cookie: a.cookie, body: { accountId: account.id, action: "post" } }), context(draft.id));
        assert.equal(intentResponse.status, 201, await intentResponse.clone().text());
        const intent = await json(intentResponse);

        const { job, jobDraftId } = runAsOwner(a.id, () => {
          const jobDraft = db.createDraft({ externalId: "", accountId: account.id, format: "repost", text: "repost action", sourceUrl: "https://x.com/source/status/1", now: 1 });
          return { job: db.createJob({ draftId: jobDraft.id, accountId: account.id, action: "repost", scheduledAt: 2, now: 1 }), jobDraftId: jobDraft.id };
        });

        const automationA = await automation.GET(apiRequest("/settings/automation", "GET", { cookie: a.cookie })).then(json);
        const automationB = await automation.GET(apiRequest("/settings/automation", "GET", { cookie: b.cookie })).then(json);
        assert.equal(automationA.operator, false);
        assert.deepEqual(automationA.accountAutomation.map((item) => item.handle), ["alice"]);
        assert.deepEqual(automationB.accountAutomation, []);
        assert.deepEqual(automationA.schedules, []);
        assert.deepEqual(automationA.logs, []);
        const automationMutation = await automation.POST(apiRequest("/settings/automation", "POST", { cookie: a.cookie, body: { paused: true } }));
        assert.equal(automationMutation.status, 403);

        const [aAccounts, bAccounts, aDrafts, bDrafts, aJobs, bJobs, aIntents, bIntents] = await Promise.all([
          accounts.GET(apiRequest("/accounts", "GET", { cookie: a.cookie })).then(json),
          accounts.GET(apiRequest("/accounts", "GET", { cookie: b.cookie })).then(json),
          drafts.GET(apiRequest("/drafts", "GET", { cookie: a.cookie })).then(json),
          drafts.GET(apiRequest("/drafts", "GET", { cookie: b.cookie })).then(json),
          jobs.GET(apiRequest("/queue", "GET", { cookie: a.cookie })).then(json),
          jobs.GET(apiRequest("/queue", "GET", { cookie: b.cookie })).then(json),
          publications.GET(apiRequest("/publications", "GET", { cookie: a.cookie })).then(json),
          publications.GET(apiRequest("/publications", "GET", { cookie: b.cookie })).then(json),
        ]);
        assert.equal(aAccounts.length, 1);
        assert.deepEqual(bAccounts, []);
        assert.deepEqual(aDrafts.map((item) => item.id).sort((left, right) => left - right), [draft.id, jobDraftId].sort((left, right) => left - right));
        assert.deepEqual(bDrafts, []);
        assert.deepEqual(aJobs.map((item) => item.id), [job.id]);
        assert.deepEqual(bJobs, []);
        assert.deepEqual(aIntents.map((item) => item.id), [intent.id]);
        assert.deepEqual(bIntents, []);

        const crossAccountPatch = await accountById.PATCH(apiRequest("/accounts/" + account.id, "PATCH", { cookie: b.cookie, body: { displayName: "Intruded" } }), context(account.id));
        const crossAccountDelete = await accountById.DELETE(apiRequest("/accounts/" + account.id, "DELETE", { cookie: b.cookie }), context(account.id));
        const crossDraftPatch = await draftById.PATCH(apiRequest("/drafts/" + draft.id, "PATCH", { cookie: b.cookie, body: { text: "Intruded" } }), context(draft.id));
        const crossDraftDelete = await draftById.DELETE(apiRequest("/drafts/" + draft.id, "DELETE", { cookie: b.cookie }), context(draft.id));
        const crossQueue = await draftQueue.POST(apiRequest("/drafts/" + draft.id + "/queue", "POST", { cookie: b.cookie, body: { accountId: account.id, action: "post" } }), context(draft.id));
        const crossJobPatch = await jobById.PATCH(apiRequest("/queue/" + job.id, "PATCH", { cookie: b.cookie, body: { status: "cancelled" } }), context(job.id));
        const crossIntentCancel = await publicationById.POST(apiRequest("/publications/" + intent.id, "POST", { cookie: b.cookie, body: { action: "cancel" } }), context(intent.id));
        assert.equal(crossAccountPatch.status, 404);
        assert.equal(crossAccountDelete.status, 404);
        assert.equal(crossDraftPatch.status, 404);
        assert.equal(crossDraftDelete.status, 404);
        assert.equal(crossQueue.status, 404);
        assert.equal(crossJobPatch.status, 404);
        assert.equal(crossIntentCancel.status, 422);
        assert.equal((await json(await accounts.GET(apiRequest("/accounts", "GET", { cookie: a.cookie }))))[0].displayName, "Alice");
        assert.equal((await json(await drafts.GET(apiRequest("/drafts", "GET", { cookie: a.cookie }))))[0].text, "A private draft");
        assert.equal((await json(await publications.GET(apiRequest("/publications", "GET", { cookie: a.cookie }))))[0].status, "pending_approval");
        assert.equal((await json(await jobs.GET(apiRequest("/queue", "GET", { cookie: a.cookie })))).length, 1);

        const anonymous = await Promise.all([
          accounts.GET(apiRequest("/accounts")), drafts.GET(apiRequest("/drafts")), jobs.GET(apiRequest("/queue")), publications.GET(apiRequest("/publications")),
        ]);
        assert.deepEqual(anonymous.map((response) => response.status), [401, 401, 401, 401]);
        const cookieName = a.cookie.split("; ")[0].split("=", 1)[0];
        const forged = await accounts.GET(apiRequest("/accounts", "GET", { cookie: cookieName + "=forged-session" }));
        assert.equal(forged.status, 401);

        const hostileOrigin = await accounts.POST(apiRequest("/accounts", "POST", { cookie: b.cookie, origin: "https://attacker.example", body: { handle: "intruder" } }));
        assert.equal(hostileOrigin.status, 403);
        assert.deepEqual(await json(await accounts.GET(apiRequest("/accounts", "GET", { cookie: b.cookie }))), []);
        const operatorDenied = await scan.POST(apiRequest("/scan", "POST", { cookie: b.cookie, body: {} }));
        assert.equal(operatorDenied.status, 403);

        assert.equal((await authPOST(authRequest("/sign-out", {}, a.cookie))).status, 200);
        assert.equal((await accounts.GET(apiRequest("/accounts", "GET", { cookie: a.cookie }))).status, 401);
        assert.equal((await accounts.GET(apiRequest("/accounts", "GET", { cookie: b.cookie }))).status, 200);
        console.log(JSON.stringify({
          sessions: 2, accountCreated: account.id, accountIsolation: true, draftIsolation: true,
          jobIsolation: true, intentIsolation: true,
          crossUserMutationStatuses: [crossAccountPatch.status, crossAccountDelete.status, crossDraftPatch.status, crossDraftDelete.status, crossQueue.status, crossJobPatch.status, crossIntentCancel.status],
          anonymousStatuses: anonymous.map((response) => response.status), forgedStatus: forged.status,
          hostileOriginStatus: hostileOrigin.status, operatorOnlyStatus: operatorDenied.status, revokedSessionStatus: 401,
        }));
      `],
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        ISPATLA_DB: database,
        BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000",
        ISPATLA_PRIVATE_BETA: "1",
        ISPATLA_SECRET_KEY: "fixture-encryption-key-for-auth-route-tests",
        ISPATLA_OPERATOR_USER_ID: "operator-not-a-test-user",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(result.stdout))).toEqual({
      sessions: 2,
      accountCreated: 1,
      accountIsolation: true,
      draftIsolation: true,
      jobIsolation: true,
      intentIsolation: true,
      crossUserMutationStatuses: [404, 404, 404, 404, 404, 404, 422],
      anonymousStatuses: [401, 401, 401, 401],
      forgedStatus: 401,
      hostileOriginStatus: 403,
      operatorOnlyStatus: 403,
      revokedSessionStatus: 401,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
