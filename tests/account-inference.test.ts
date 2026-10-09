import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverAccountTopic, inferAccountCategories } from "../src/server/account-inference";

const catalog = [
  { id: 1, slug: "technology", name: "Technology", keywords: ["software", "linux", "open source"], description: "Technology" },
  { id: 2, slug: "finance", name: "Finance", keywords: ["stocks", "markets"], description: "Finance" },
];

test("infers only catalog topics evidenced by the account bio and its own posts", () => {
  const result = inferAccountCategories({
    handle: "dev_ada", displayName: "Ada Dev", bio: "Linux and open source engineer",
    posts: ["Building software on Linux", "Open source software is great"], catalog,
  });
  expect(result.suggestions.map(({ slug }) => slug)).toEqual(["technology"]);
  expect(result.suggestions[0].confidence).toBeGreaterThan(0);
  expect(result.suggestions[0].evidence).toContain("linux");
  expect(result.contentLanguage).toBe("en");
});

test("returns no invented topics when the profile has insufficient evidence", () => {
  const result = inferAccountCategories({ handle: "x_user", displayName: "X", bio: "", posts: ["Hello world"], catalog });
  expect(result.suggestions).toEqual([]);
  expect(result.status).toBe("insufficient_evidence");
  expect(result.contentLanguage).toBe("unknown");
});

test("finds a specific repeated topic from the connected account's own posts when the catalog has no match", () => {
  const topic = discoverAccountTopic({ bio: "", posts: ["Building secure Bitcoin wallet infrastructure", "Bitcoin wallet recovery guide", "Bitcoin wallet safety tips"] });
  expect(topic?.name).toBe("Bitcoin Wallet");
  expect(topic?.slug).toBe("bitcoin-wallet");
  expect(topic?.keywords).toEqual(["bitcoin", "wallet"]);
  expect(topic?.evidence).toHaveLength(3);
  expect(discoverAccountTopic({ bio: "", posts: ["Hello world"] })).toBeNull();
});

test("inference jobs are idempotent and accepted categories preserve later manual edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-account-inference-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { acceptAccountCategoryInference, ensureDatabase, getAccountCategoryConfigs, getAccounts, getCategories, getCategoriesForAccount, getOwnAccountInference, saveAccount, saveAccountCategoryConfig, saveAccountInferenceJob, saveAccountInferenceSuggestions, saveGeneratedAccountCategory } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database did not initialize");
      const now = 1000;
      const output = runAsOwner("inference-owner", () => {
        const account = saveAccount({accountKey:"x:1",handle:"ada",displayName:"Ada",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:24,capabilities:[],now});
        const generated = saveGeneratedAccountCategory({accountId:account.id,name:"Bitcoin Wallet",slug:"bitcoin-wallet",description:"Repeated topic",keywords:["bitcoin","wallet"],examples:["wallet guide"],now});
        const category = getCategories().find((item) => item.slug === "technology");
        if (!category) throw new Error("technology category missing");
        const job = saveAccountInferenceJob({accountId:account.id,status:"running",now});
        const retry = saveAccountInferenceJob({accountId:account.id,status:"running",now});
        if (!job.claimed || retry.claimed || job.id !== retry.id) throw new Error("duplicate inference job claim");
        const inference = {status:"ready",contentLanguage:"en",suggestions:[{categoryId:category.id,slug:category.slug,name:category.name,confidence:0.8,evidence:["linux","software"]}]};
        saveAccountInferenceSuggestions({accountId:account.id,jobId:job.id,result:inference,now});
        const pending = getOwnAccountInference(account.id);
        const first = acceptAccountCategoryInference({accountId:account.id,categoryIds:[category.id],weights:{[category.id]:2.5},now:now+1});
        const savedAccount = getAccounts().find((item) => item.id === account.id);
        if (!savedAccount) throw new Error("saved account missing");
        saveAccount({...savedAccount,styleProfile:{...savedAccount.styleProfile,categories:[]},now:now+2});
        const removedByUser = getAccountCategoryConfigs(account.id);
        saveAccountCategoryConfig({accountId:account.id,categoryId:category.id,enabled:true,primary:true,weight:3,priority:99,publishThreshold:70,dailyBudget:8,styleOverride:{tone:"manual"},aiRouteOverride:{}});
        const nextJob = saveAccountInferenceJob({accountId:account.id,status:"running",now:now+4,regenerate:true});
        saveAccountInferenceSuggestions({accountId:account.id,jobId:nextJob.id,result:inference,now:now+4});
        const afterRetryAccept = acceptAccountCategoryInference({accountId:account.id,categoryIds:[category.id],now:now+5});
        const hidden = runAsOwner("another-owner", () => { try { getOwnAccountInference(account.id); return "leaked"; } catch { return "isolated"; } });
        const other = saveAccount({accountKey:"x:2",handle:"other",displayName:"Other",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:24,capabilities:[],now});
        const categoryIsolated = !getCategoriesForAccount(other.id).some((item) => item.id === generated.id);
        let crossAccountAssignment = false;
        try { saveAccountCategoryConfig({accountId:other.id,categoryId:generated.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}}); }
        catch { crossAccountAssignment = true; }
        const manualPrimary = getCategories().find((item) => item.slug === "finance");
        if (!manualPrimary) throw new Error("finance category missing");
        saveAccountCategoryConfig({accountId:other.id,categoryId:manualPrimary.id,enabled:true,primary:true,weight:4,priority:9,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}});
        const otherJob = saveAccountInferenceJob({accountId:other.id,status:"running",now});
        saveAccountInferenceSuggestions({accountId:other.id,jobId:otherJob.id,result:inference,now});
        const otherAccepted = acceptAccountCategoryInference({accountId:other.id,categoryIds:[category.id],now:now+1});
        return {pending:pending?.status,first,removedByUser,account:getAccounts(),afterRetryAccept:getAccountCategoryConfigs(account.id),hidden,otherAccepted,categoryIsolated,crossAccountAssignment};
      });
      console.log(JSON.stringify(output));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.pending).toBe("ready");
    expect(output.first[0]).toMatchObject({ source: "inferred", priority: 1, primary: true, weight: 2.5 });
    expect(output.removedByUser[0]).toMatchObject({ enabled: false, source: "manual", userModifiedAt: 1002 });
    expect(output.account[0].styleProfile).toMatchObject({ contentLocale: "en", preferredFormats: ["post"] });
    expect(output.afterRetryAccept[0]).toMatchObject({ source: "manual", priority: 99, weight: 3, styleOverride: { tone: "manual" } });
    expect(output.hidden).toBe("isolated");
    expect(output.categoryIsolated).toBe(true);
    expect(output.crossAccountAssignment).toBe(true);
    expect(output.otherAccepted.find((item: { categorySlug: string }) => item.categorySlug === "finance")).toMatchObject({ primary: true, source: "manual", priority: 9 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("background sweep binds each connected owner, skips missing read scopes and completed accounts", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-account-inference-worker-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner, currentOwnerId } from "./src/server/owner-context.ts";
      import { ensureDatabase, getCategoriesForAccount, getOwnAccountInference, saveAccount } from "./src/server/db.ts";
      import { connectXAccount } from "./src/server/x-oauth-store.ts";
      import { runPendingAccountCategoryInferences } from "./src/server/account-inference.ts";
      if (!ensureDatabase()) throw new Error("database unavailable");
      const scopes = ["tweet.read","tweet.write","users.read","media.write","offline.access"];
      const addConnected = (ownerUserId, xUserId, handle) => connectXAccount({ownerUserId,xUserId,handle,accessToken:"access",refreshToken:"refresh",expiresAt:9999999999,scopes,now:1000});
      const ready = addConnected("owner-ready","100001","ready_account");
      const limited = addConnected("owner-limited","100002","limited_account");
      runAsOwner("owner-unconnected",()=>saveAccount({accountKey:"manual",handle:"manual_account",displayName:"Manual",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:24,capabilities:[],now:1000}));
      const disabled = addConnected("owner-disabled","100003","disabled_user");
      const { Database } = process.getBuiltinModule("bun:sqlite");
      const raw = new Database(process.env.ISPATLA_DB);
      raw.exec("CREATE TABLE auth_user_status(owner_user_id TEXT PRIMARY KEY,status TEXT NOT NULL,updated_at INTEGER NOT NULL)");
      for (const owner of ["owner-ready","owner-limited","owner-unconnected"]) raw.query("INSERT INTO auth_user_status(owner_user_id,status,updated_at) VALUES (?,'active',1000)").run(owner);
      raw.query("INSERT INTO auth_user_status(owner_user_id,status,updated_at) VALUES (?,'disabled',1000)").run("owner-disabled");
      raw.query("UPDATE x_oauth_credentials SET scopes_json=? WHERE account_id=?").run(JSON.stringify([]), limited.accountId);
      raw.close();
      let profileReads = 0;
      const client = {
        getOwnProfile: async () => { if (currentOwnerId() !== "owner-ready") throw new Error("owner context missing"); profileReads++; return {description:"Bitcoin wallet developer"}; },
        getOwnTimeline: async () => { if (currentOwnerId() !== "owner-ready") throw new Error("owner context missing"); return ["Building secure Bitcoin wallet infrastructure", "Bitcoin wallet recovery guide", "Bitcoin wallet safety tips"]; },
      };
      const first = await runPendingAccountCategoryInferences({now:1100,limit:5,client});
      const afterFirst = runAsOwner("owner-ready",()=>getOwnAccountInference(ready.accountId));
      const generated = runAsOwner("owner-ready",()=>getCategoriesForAccount(ready.accountId).filter((item) => item.accountId === ready.accountId).map((item) => ({name:item.name,slug:item.slug})));
      const crossOwner = runAsOwner("owner-limited",()=>getCategoriesForAccount(limited.accountId).some((item) => item.accountId === ready.accountId));
      const second = await runPendingAccountCategoryInferences({now:1200,limit:5,client});
      console.log(JSON.stringify({first,second,profileReads,readyStatus:afterFirst?.status,generated,crossOwner}));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3"), ISPATLA_TOKEN_KEY_CURRENT: "worker-inference-test-key-long-enough", X_OAUTH_CLIENT_ID: "worker-test-client", X_OAUTH_REDIRECT_URI: "http://localhost/api/x/oauth/callback" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.first).toEqual({ attempted: 1, completed: 1, skipped: 3, failed: 0 });
    expect(output.second).toEqual({ attempted: 0, completed: 0, skipped: 4, failed: 0 });
    expect(output.profileReads).toBe(1);
    expect(output.readyStatus).toBe("ready");
    expect(output.generated).toHaveLength(1);
    expect(output.generated[0].name).toBe("Bitcoin Wallet");
    expect(output.crossOwner).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
