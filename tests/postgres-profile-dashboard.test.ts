import { expect, test } from "bun:test";

test("PostgreSQL profiles are created and read only for the authenticated owner", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from "bun:test";
    import { PgDialect } from "drizzle-orm/pg-core/dialect";
    import { runAsOwner } from "./src/server/owner-context.ts";
    const profiles = new Map();
    const reads = [];
    const dialect = new PgDialect();
    const db = { execute: async (query) => {
      const { sql, params: values } = dialect.sqlToQuery(query);
      const owner = values[0];
      if (sql.startsWith("INSERT INTO ispatla_app.user_profiles")) {
        if (!profiles.has(owner)) profiles.set(owner, { username: values[1], display_name: "", bio: "", visibility: "private", created_at: values[2], updated_at: values[2], x_handle: null, avatar_url: null, onboarding_completed: false });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT username")) {
        reads.push(owner);
        return { rows: profiles.has(owner) ? [profiles.get(owner)] : [] };
      }
      throw new Error("unexpected SQL");
    } };
    mock.module("@/server/postgres", () => ({ getPostgresDb: () => db }));
    const { getPostgresOwnUserProfile } = await import("./src/server/postgres-profile-dashboard.ts");
    const a = await runAsOwner("profile-a", () => getPostgresOwnUserProfile(1));
    const b = await runAsOwner("profile-b", () => getPostgresOwnUserProfile(2));
    const aAgain = await runAsOwner("profile-a", () => getPostgresOwnUserProfile(3));
    if (a.username !== aAgain.username || a.username === b.username || reads.join(",") !== "profile-a,profile-b,profile-a") throw new Error("owner profile isolation failed");
    console.log("owner-scoped profile reads verified");
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toContain("owner-scoped profile reads verified");
}, 30_000);
