import { expect, test } from "bun:test";

test("public profiles, avatar access and sitemap enforce enabled-owner eligibility", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from "bun:test";
    import { PgDialect } from "drizzle-orm/pg-core/dialect";
    const dialect = new PgDialect();
    let fail = false;
    const queries = [];
    mock.module("@/server/postgres", () => ({ getPostgresDb: () => ({ execute: async query => {
      if (fail) throw new Error("database unavailable");
      const compiled = dialect.sqlToQuery(query);
      const sql = compiled.sql;
      if (sql.includes("FROM ispatla_app.hit_shares hit")) {
        if (!sql.includes("status.owner_user_id=hit.owner_user_id") || !sql.includes("status.status='disabled'")) throw new Error("disabled shares remain public");
        return { rows: [] };
      }
      if (!sql.includes("NOT EXISTS") || !sql.includes("ispatla_auth.auth_user_status") || !sql.includes("status.owner_user_id=profile.owner_user_id") || !sql.includes("status.status='disabled'")) throw new Error("disabled owner can leak");
      if (!sql.includes("profile.visibility='public'") || !sql.includes("profile.onboarding_completed=TRUE")) throw new Error("incomplete/private profile can leak");
      queries.push(compiled);
      if (sql.startsWith("SELECT 1")) return { rows: [] };
      if (sql.includes("profile.updated_at")) return { rows: [
        { username: "abcdefghijklmnopqrstuvwx", x_handle: "valid_handle", updated_at: 1700000000 },
        { username: "ABCDEFGHIJKLMNOPQRSTUVWX", x_handle: "docs", updated_at: 1700000001 },
        { username: "invalid", x_handle: null, updated_at: 1700000002 },
      ] };
      return { rows: [] };
    } }) }));
    const profiles = await import("./src/server/postgres-public-profile.ts");
    await profiles.getPostgresPublicUserProfile("abcdefghijklmnopqrstuvwx");
    await profiles.getPostgresPublicUserProfileByHandle("valid_handle");
    if (await profiles.getPostgresProfileAvatarAccess("123", "disabled-owner")) throw new Error("avatar unexpectedly public");
    const sharing = await import("./src/server/postgres-hit-sharing.ts");
    if (await sharing.getPostgresPublicHitShare("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")) throw new Error("disabled share leaked");
    if ((await sharing.getPostgresLeaderboardEvidence()).length) throw new Error("disabled leaderboard share leaked");
    const { default: sitemap, dynamic } = await import("./src/app/sitemap.ts");
    const entries = await sitemap();
    if (dynamic !== "force-dynamic") throw new Error("stale profile visibility can be cached");
    if (!entries.some(entry => entry.url === "https://ispatla.tr/valid_handle")) throw new Error("public handle missing");
    if (!entries.some(entry => entry.url === "https://ispatla.tr/u/ABCDEFGHIJKLMNOPQRSTUVWX")) throw new Error("reserved handle fallback missing");
    if (entries.some(entry => entry.url.endsWith("/u/invalid") || entry.alternates)) throw new Error("invalid or localized sitemap entry");
    if (entries.filter(entry => !entry.lastModified).length !== 10) throw new Error("static public routes missing");
    for (const handle of ["docs", "dashboard", "accounts", "profile", "en", "tr"]) {
      if (profiles.postgresProfilePath(handle, "abcdefghijklmnopqrstuvwx") !== "/u/abcdefghijklmnopqrstuvwx") throw new Error("reserved route conflict");
    }
    fail = true;
    let rejected = false;
    try { await sitemap(); } catch { rejected = true; }
    if (!rejected) throw new Error("database failure published a misleading sitemap");
    console.log("public profile sitemap and enabled-owner SQL verified");
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toContain("public profile sitemap and enabled-owner SQL verified");
}, 30_000);
