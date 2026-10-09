import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("source selections, settings, and category mappings stay within the owning X account", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-account-sources-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import { runAsOwner } from "./src/server/owner-context.ts";
        import { addAccountSource, ensureDatabase, getAccountSources, getAccountSourceCategoryConfigs, getAccountCategoryConfigs, getCategories, getSourceCategoryConfigs, saveAccountCategoryConfig, saveAccountSourceCategoryConfig, saveSourceCategoryConfig, saveAccount, updateAccountSource, upsertSource } from "./src/server/db.ts";
        if (!ensureDatabase()) throw new Error("database unavailable");
        const now = 1000;
        const canonical = {handle:"shared_source",name:"Shared identity",enabled:true,maxPosts:20,rightsStatus:"unknown",profile:{origin:"seed",status:"active",pinned:false}};
        upsertSource(canonical, now);
        const result = runAsOwner("source-owner", () => {
          const first = saveAccount({accountKey:"x:first",handle:"first",displayName:"First",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:24,capabilities:[],now});
          const second = saveAccount({accountKey:"x:second",handle:"second",displayName:"Second",enabled:true,defaultAccount:false,automationMode:"manual",dailyLimit:24,capabilities:[],now});
          const finance = getCategories().find(row => row.slug === "finance");
          const technology = getCategories().find(row => row.slug === "technology");
          if (!finance || !technology) throw new Error("fixture categories missing");
          for (const [account, category] of [[first,finance],[second,technology]]) saveAccountCategoryConfig({accountId:account.id,categoryId:category.id,enabled:true,primary:true,weight:1,priority:1,publishThreshold:null,dailyBudget:null,styleOverride:{},aiRouteOverride:{}});
          addAccountSource(first.id,"shared_source");
          addAccountSource(second.id,"shared_source");
          updateAccountSource({accountId:first.id,sourceHandle:"shared_source",name:"First private label",niche:"finance",maxPosts:7});
          saveAccountSourceCategoryConfig({accountId:first.id,sourceHandle:"shared_source",categoryId:finance.id,monitoringTier:"B",discoveryWeight:1,categoryReputation:null,enabled:true,lastEvidenceAt:now});
          saveAccountSourceCategoryConfig({accountId:second.id,sourceHandle:"shared_source",categoryId:technology.id,monitoringTier:"A",discoveryWeight:2,categoryReputation:null,enabled:true,lastEvidenceAt:now});
          saveSourceCategoryConfig({sourceHandle:"shared_source",categoryId:finance.id,monitoringTier:"C",discoveryWeight:1,categoryReputation:null,enabled:true,lastEvidenceAt:now});
          const scopedFirst = getAccountSources(first.id);
          const scopedSecond = getAccountSources(second.id);
          const categoriesFirst = getAccountSourceCategoryConfigs(first.id);
          const categoriesSecond = getAccountSourceCategoryConfigs(second.id);
          const otherOwner = runAsOwner("other-source-owner", () => { try { getAccountSources(first.id); return "leaked"; } catch { return "isolated"; } });
          return { first:scopedFirst.map(({handle,name,maxPosts,profile})=>({handle,name,maxPosts,niche:profile.niche})), second:scopedSecond.map(({handle,name,maxPosts,profile})=>({handle,name,maxPosts,niche:profile.niche})), categoriesFirst:categoriesFirst.map(({categorySlug})=>categorySlug), categoriesSecond:categoriesSecond.map(({categorySlug})=>categorySlug), ownerConfigs:getAccountSourceCategoryConfigs().map(({accountId})=>accountId).sort(), legacy:getSourceCategoryConfigs("shared_source").map(({categorySlug})=>categorySlug), categoryOwnership:getAccountCategoryConfigs(first.id).map(({categorySlug})=>categorySlug), otherOwner };
        });
        console.log(JSON.stringify(result));
      `],
      cwd: process.cwd(),
      env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = new TextDecoder().decode(result.stdout).trim().split("\n").at(-1) || "{}";
    expect(JSON.parse(output)).toMatchObject({
      first: [{ handle: "shared_source", name: "First private label", maxPosts: 7, niche: "finance" }],
      second: [{ handle: "shared_source", name: "Shared identity", maxPosts: 20 }],
      categoriesFirst: ["finance"], categoriesSecond: ["technology"], ownerConfigs: [1, 2],
      legacy: ["finance"], categoryOwnership: ["finance"], otherOwner: "isolated",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
