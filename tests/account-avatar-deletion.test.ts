import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("account deletion removes cached X avatar bytes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-avatar-deletion-"));
  const databasePath = join(directory, "state.sqlite3");
  const script = `
    import assert from "node:assert/strict";
    import { Database } from "bun:sqlite";
    import { createAuthRuntime } from "./src/server/auth.ts";
    import { ensureDatabase, getOwnUserProfile } from "./src/server/db.ts";
    import { runAsOwner } from "./src/server/owner-context.ts";
    import { cacheProfileAvatar, profileAvatarFile } from "./src/server/profile-avatar.ts";

    const base = "http://localhost:3000";
    const runtime = await createAuthRuntime({ env: process.env });
    const request = (path, body, cookie) => new Request(base + "/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: { origin: base, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookie = (response) => (response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""])
      .map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
    try {
      assert.equal(ensureDatabase(), true);
      const signup = await runtime.handler(request("/sign-up/email", { email: "avatar-delete@example.test", password: "correct-horse-avatar-1" }));
      assert.equal(signup.status, 200, await signup.clone().text());
      const sessionCookie = cookie(signup);
      const session = await (await runtime.handler(request("/get-session", undefined, sessionCookie))).json();
      const ownerId = session.user.id;
      runAsOwner(ownerId, () => getOwnUserProfile());
      const db = new Database(process.env.ISPATLA_DB);
      db.query("INSERT INTO user_profile_x_identity(owner_user_id,x_user_id) VALUES (?,?)").run(ownerId, "123456789");
      db.close();

      const root = process.env.ISPATLA_DB.replace(/[^/]+$/, "profile-avatars");
      const bytes = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
      const avatarUrl = "https://pbs.twimg.com/profile_images/123456789/avatar.png";
      const fetcher = async () => new Response(Buffer.from(bytes), { headers: { "content-type": "image/png" } });
      assert.equal(await cacheProfileAvatar({ xUserId: "123456789", avatarUrl, fetcher, root }), "/api/profile/avatar/123456789");
      assert.ok(await profileAvatarFile("123456789", root));

      const deletion = await runtime.handler(new Request(base + "/api/auth/delete-user", {
        method: "POST",
        headers: { origin: base, "content-type": "application/json", cookie: sessionCookie },
        body: JSON.stringify({ password: "correct-horse-avatar-1" }),
      }));
      assert.equal(deletion.status, 200, await deletion.clone().text());
      assert.equal(await profileAvatarFile("123456789", root), null);
    } finally { runtime.close(); }
  `;
  try {
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ISPATLA_DB: databasePath,
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
        BETTER_AUTH_URL: "http://localhost:3000",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
