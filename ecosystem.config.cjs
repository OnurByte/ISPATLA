/**
 * Ispatla — production process definition for the shared 67 box.
 *
 * Panel auth: the app's own `src/proxy.ts` gate expects an
 * `Authorization: Bearer <ISPATLA_ADMIN_TOKEN>` header, but a browser cannot
 * send that. Nginx injects it server-side from a root-only file so the token
 * never reaches the client bundle, localStorage or logs.
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
        // The panel must not run the in-app scheduler: the systemd worker owns
        // the automation loop against the same SQLite file.
        ISPATLA_AUTOMATION: "0",
      },
    },
  ],
};
