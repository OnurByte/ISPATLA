/**
 * Ispatla — production process definition for the shared 67 box.
 *
 * Panel auth: the app's own `src/proxy.ts` gate expects an
 * `Authorization: Bearer <ISPAT...EN>` header, but a browser cannot
 * send that. Nginx injects it server-side from a root-only file so the token
 * never reaches the client bundle, localStorage or logs.
 *
 * Two processes, one writer: the web app never runs the in-app scheduler
 * (ISPATLA_AUTOMATION=0); the standalone worker owns the automation loop
 * against the same SQLite file. This box has no systemd user bus (it is an
 * LXC), so pm2 supervises both and `pm2 save` makes them survive a reboot.
 */
const crypto = require("node:crypto");
const { readFileSync } = require("node:fs");

const TOKEN_FILE = "/root/.ispatla-admin-token";
const SECRET_FILE = "/root/.ispatla-secret-key";

function readOrCreate(file, bytes) {
  try {
    const value = readFileSync(file, "utf8").trim();
    if (value) return value;
  } catch {}
  const value = crypto.randomBytes(bytes).toString("hex");
  require("node:fs").writeFileSync(file, value + "\n", { mode: 0o600 });
  return value;
}

const adminToken = readOrCreate(TOKEN_FILE, 32);
const secretKey = readOrCreate(SECRET_FILE, 32);

module.exports = {
  apps: [
    {
      name: "ispatla",
      cwd: "/root/ispatla",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3500",
      interpreter: "node",
      time: true,
      env: {
        NODE_ENV: "production",
        ISPATLA_ADMIN_TOKEN: adminToken,
        ISPATLA_SECRET_KEY: secretKey,
        // The panel must not run the in-app scheduler: the standalone worker
        // owns the automation loop against the same SQLite file.
        ISPATLA_AUTOMATION: "0",
      },
    },
    {
      name: "ispatla-worker",
      cwd: "/root/ispatla",
      // A shell wrapper, not the .ts file: pm2's bun interpreter shim
      // require()s the script and rejects an async ESM module.
      script: "scripts/run-automation-worker.sh",
      interpreter: "none",
      time: true,
      env: {
        NODE_ENV: "production",
        ISPATLA_ADMIN_TOKEN: adminToken,
        ISPATLA_SECRET_KEY: secretKey,
        // The worker IS the scheduler; the web app keeps this at "0".
        ISPATLA_AUTOMATION: "1",
        ISPATLA_WORKER_TICK_MS: "30000",
      },
    },
  ],
};
