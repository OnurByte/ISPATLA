import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPublicProfileHandle, isPublicProfileSlug, validateProfileCompletion } from "../src/server/public-profile";
import { profilePathForIdentity } from "../src/server/db";

test("profile completion accepts no client-supplied X profile or visibility fields", () => {
  expect(validateProfileCompletion({})).toBeUndefined();
  for (const field of ["displayName", "bio", "visibility", "username", "ownerUserId", "xHandle", "avatarUrl", "profilePath", "onboardingCompleted"]) {
    expect(() => validateProfileCompletion({ [field]: "forged" })).toThrow();
  }
});

test("X profile sync derives visibility from the connected account, binds one verified identity, and projects no private data", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-public-profile-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase, getOwnUserProfile, getPublicUserProfile, getPublicUserProfileByHandle, getProfileAvatarAccess, saveOwnUserProfile, syncUserProfileFromX } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database initialization failed");
      const first = runAsOwner("profile-owner-a", () => getOwnUserProfile(1000));
      const second = runAsOwner("profile-owner-b", () => getOwnUserProfile(1000));
      if (!/^[A-Za-z0-9_-]{24}$/.test(first.username) || first.username === second.username) throw new Error("profile slug is not opaque and unique");
      if (first.visibility !== "private" || first.onboardingCompleted || getPublicUserProfile(first.username) !== null) throw new Error("profile should start private pending X sync");
      const completedByOtherOwner = runAsOwner("profile-owner-b", () => saveOwnUserProfile({now:1001}));
      if (completedByOtherOwner.username !== second.username || completedByOtherOwner.displayName !== "" || completedByOtherOwner.visibility !== "private" || getPublicUserProfile(first.username) !== null) throw new Error("owner scope was crossed or profile fields were client-controlled");
      const optedIn = runAsOwner("profile-owner-a", () => saveOwnUserProfile({now:1002}));
      syncUserProfileFromX({ownerUserId:"profile-owner-a",xUserId:"10001",handle:"AdaX",displayName:"Ada X",bio:"X bio",protected:false,avatarUrl:"/api/profile/avatar/10001",now:1003});
      const publicProfile = getPublicUserProfile(optedIn.username);
      const byHandle = getPublicUserProfileByHandle("adax");
      syncUserProfileFromX({ownerUserId:"profile-owner-a",xUserId:"10002",handle:"Other",displayName:"Other",bio:"",protected:true,avatarUrl:null,now:1004});
      syncUserProfileFromX({ownerUserId:"profile-owner-b",xUserId:"10003",handle:"ADAX",displayName:"Collision",bio:"",protected:true,avatarUrl:null,now:1005});
      const publicAvatarAccess = getProfileAvatarAccess("10001");
      syncUserProfileFromX({ownerUserId:"profile-owner-a",xUserId:"10001",handle:"AdaX",displayName:"Ada X",bio:"X bio",protected:true,avatarUrl:null,now:1006});
      const hiddenAgain = runAsOwner("profile-owner-a", () => getOwnUserProfile(1006));
      const privateAvatarAccess = getProfileAvatarAccess("10001");
      const afterOptOut = getPublicUserProfile(hiddenAgain.username);
      runAsOwner("profile-race",()=>getOwnUserProfile(1007));
      const { DatabaseSync } = await import("node:sqlite");
      const raceDb = new DatabaseSync(process.env.ISPATLA_DB);
      raceDb.exec("CREATE TRIGGER simulate_profile_binding_race AFTER INSERT ON user_profile_x_identity WHEN NEW.owner_user_id='profile-race' BEGIN UPDATE user_profile_x_identity SET x_user_id='99999' WHERE owner_user_id=NEW.owner_user_id; END;");
      raceDb.close();
      syncUserProfileFromX({ownerUserId:"profile-race",xUserId:"88888",handle:"WrongRaceWriter",displayName:"Wrong",bio:"",protected:false,avatarUrl:null,now:1008});
      const raceProfile = runAsOwner("profile-race",()=>getOwnUserProfile(1009));
      if (raceProfile.xHandle !== null || raceProfile.displayName !== "") throw new Error("losing X identity wrote into profile during binding race");
      console.log(JSON.stringify({first,second,completedByOtherOwner,publicProfile,byHandle,afterOptOut,publicAvatarAccess,privateAvatarAccess,raceProfile}));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.first).toMatchObject({ visibility: "private", onboardingCompleted: false, displayName: "", bio: "", xHandle: null, avatarUrl: null, profilePath: expect.stringMatching(/^\/u\//) });
    expect(isPublicProfileSlug(output.first.username)).toBe(true);
    expect(output.second.username).not.toBe(output.first.username);
    expect(output.completedByOtherOwner).toMatchObject({ username: output.second.username, displayName: "", visibility: "private", onboardingCompleted: true });
    expect(output.publicProfile).toEqual({ username: output.first.username, displayName: "Ada X", bio: "X bio", xHandle: "AdaX", avatarUrl: "/api/profile/avatar/10001", profilePath: "/AdaX" });
    expect(output.byHandle).toEqual(output.publicProfile);
    expect(Object.keys(output.publicProfile).sort()).toEqual(["avatarUrl", "bio", "displayName", "profilePath", "username", "xHandle"]);
    expect(output.publicProfile).not.toHaveProperty("ownerUserId");
    expect(output.publicProfile).not.toHaveProperty("onboardingCompleted");
    expect(output.afterOptOut).toBeNull();
    expect(output.publicAvatarAccess).toBe(true);
    expect(output.privateAvatarAccess).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("profile paths resolve only verified handles and avoid static routes", () => {
  expect(isPublicProfileHandle("writer_1")).toBe(true);
  expect(isPublicProfileHandle("APP")).toBe(false);
  expect(profilePathForIdentity("writer_1", "opaque")).toBe("/writer_1");
  expect(profilePathForIdentity("APP", "opaque")).toBe("/u/opaque");
  expect(profilePathForIdentity("tr", "opaque")).toBe("/u/opaque");
  expect(isPublicProfileSlug("Abcdefghijklmnopqrstuvwx")).toBe(true);
  expect(isPublicProfileSlug("ada")).toBe(false);
});

test("migration preserves an existing private profile choice", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-profile-upgrade-"));
  try {
    const databasePath = join(directory, "legacy.sqlite3");
    const initialize = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase,getOwnUserProfile,saveOwnUserProfile } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("initialization failed");
      runAsOwner("legacy-owner",()=>saveOwnUserProfile({now:1}));
      console.log(JSON.stringify(runAsOwner("legacy-owner",()=>getOwnUserProfile(2))));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: databasePath }, stdout: "pipe", stderr: "pipe" });
    expect(initialize.exitCode, new TextDecoder().decode(initialize.stderr)).toBe(0);
    const downgrade = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.env.ISPATLA_DB);
      db.exec("DROP INDEX user_profiles_x_handle_ci_idx; DROP TABLE user_profile_x_identity; ALTER TABLE user_profiles DROP COLUMN x_handle; ALTER TABLE user_profiles DROP COLUMN avatar_url; ALTER TABLE user_profiles DROP COLUMN onboarding_completed; DELETE FROM schema_migrations WHERE version=32;");
      db.close();
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: databasePath }, stdout: "pipe", stderr: "pipe" });
    expect(downgrade.exitCode, new TextDecoder().decode(downgrade.stderr)).toBe(0);
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase,getOwnUserProfile,getPublicUserProfile } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("profile migration failed");
      const own = runAsOwner("legacy-owner",()=>getOwnUserProfile(2000));
      if (own.visibility !== "private" || !own.onboardingCompleted || getPublicUserProfile(own.username) !== null) throw new Error("legacy privacy choice changed");
      console.log(JSON.stringify(own));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: databasePath }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output).toMatchObject({ visibility: "private", onboardingCompleted: true });
    expect(output.profilePath).toBe(`/u/${output.username}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
