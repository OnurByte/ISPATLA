import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPublicProfileSlug, validateProfileUpdate } from "../src/server/public-profile";

test("public profile updates accept only safe public fields and visibility values", () => {
  expect(validateProfileUpdate({ displayName: " Ada ", bio: " Hello ", visibility: "public" })).toEqual({ displayName: "Ada", bio: "Hello", visibility: "public" });
  expect(() => validateProfileUpdate({ displayName: "Ada", bio: "", visibility: "public", username: "predictable" })).toThrow();
  expect(() => validateProfileUpdate({ displayName: "x".repeat(81), bio: "", visibility: "private" })).toThrow();
  expect(() => validateProfileUpdate({ displayName: "", bio: "", visibility: "listed" })).toThrow();
});

test("profiles start private, are owner-scoped, and public lookup exposes only opted-in fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-public-profile-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { ensureDatabase, getOwnUserProfile, getPublicUserProfile, saveOwnUserProfile } from "./src/server/db.ts";
      if (!ensureDatabase()) throw new Error("database initialization failed");
      const first = runAsOwner("profile-owner-a", () => getOwnUserProfile(1000));
      const second = runAsOwner("profile-owner-b", () => getOwnUserProfile(1000));
      if (!/^[A-Za-z0-9_-]{24}$/.test(first.username) || first.username === second.username) throw new Error("profile slug is not opaque and unique");
      if (first.visibility !== "private" || getPublicUserProfile(first.username) !== null) throw new Error("profile was public by default");
      const changedByOtherOwner = runAsOwner("profile-owner-b", () => saveOwnUserProfile({displayName:"Wrong owner",bio:"",visibility:"public",now:1001}));
      if (changedByOtherOwner.username !== second.username || getPublicUserProfile(first.username) !== null) throw new Error("owner scope was crossed");
      const optedIn = runAsOwner("profile-owner-a", () => saveOwnUserProfile({displayName:"Ada",bio:"Public bio",visibility:"public",now:1002}));
      const publicProfile = getPublicUserProfile(optedIn.username);
      const hiddenAgain = runAsOwner("profile-owner-a", () => saveOwnUserProfile({displayName:"Ada",bio:"Public bio",visibility:"private",now:1003}));
      const afterOptOut = getPublicUserProfile(hiddenAgain.username);
      console.log(JSON.stringify({first,second,changedByOtherOwner,publicProfile,afterOptOut}));
    `], cwd: process.cwd(), env: { ...process.env, ISPATLA_DB: join(directory, "state.sqlite3") }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(output.first).toMatchObject({ visibility: "private", displayName: "", bio: "" });
    expect(isPublicProfileSlug(output.first.username)).toBe(true);
    expect(output.second.username).not.toBe(output.first.username);
    expect(output.changedByOtherOwner).toMatchObject({ username: output.second.username, displayName: "Wrong owner", visibility: "public" });
    expect(output.publicProfile).toEqual({ username: output.first.username, displayName: "Ada", bio: "Public bio" });
    expect(Object.keys(output.publicProfile).sort()).toEqual(["bio", "displayName", "username"]);
    expect(output.afterOptOut).toBeNull();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("public route slugs must be server-generated opaque base64url values", () => {
  expect(isPublicProfileSlug("Abcdefghijklmnopqrstuvwx")).toBe(true);
  expect(isPublicProfileSlug("ada")).toBe(false);
  expect(isPublicProfileSlug("a".repeat(24))).toBe(false);
  expect(isPublicProfileSlug("x".repeat(23) + "!")).toBe(false);
});
