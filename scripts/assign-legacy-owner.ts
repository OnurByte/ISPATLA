import { ensureDatabase } from "../src/server/db";

const args = process.argv.slice(2);
const emailArg = args.find((value) => value.startsWith("--email="))?.slice("--email=".length);
const confirmArg = args.find((value) => value.startsWith("--confirm-email="))?.slice("--confirm-email=".length);
if (!emailArg || confirmArg !== emailArg) {
  throw new Error("Usage: bun scripts/assign-legacy-owner.ts --email=<verified-email> --confirm-email=<same-email>");
}
if (!ensureDatabase()) throw new Error("application database initialization failed");

const getBuiltinModule = (process as unknown as { getBuiltinModule(name: string): unknown }).getBuiltinModule;
const { Database } = getBuiltinModule("bun:sqlite") as { Database: new (path: string) => {
  query(sql: string): { get(...values: unknown[]): Record<string, unknown> | null };
  exec(sql: string): void;
  close(): void;
} };
const path = process.env.ISPATLA_DB || `${process.cwd()}/state/ispatla.sqlite3`;
const db = new Database(path);
try {
  const user = db.query("SELECT id FROM user WHERE email=? AND emailVerified=1 LIMIT 1").get(emailArg);
  if (!user || typeof user.id !== "string" || !user.id) throw new Error("no Better Auth user with that verified email");
  db.exec("BEGIN IMMEDIATE;");
  try {
    const owner = String(user.id).replaceAll("'", "''");
    const secretPrefix = `owner:${encodeURIComponent(String(user.id))}:`.replaceAll("'", "''");
    db.exec(`UPDATE accounts SET owner_user_id='${owner}' WHERE owner_user_id IS NULL;
      UPDATE drafts SET owner_user_id='${owner}' WHERE owner_user_id IS NULL;
      UPDATE draft_batches SET owner_user_id='${owner}' WHERE owner_user_id IS NULL;
      UPDATE usage_events SET owner_user_id='${owner}' WHERE owner_user_id IS NULL;
      UPDATE secrets SET name='${secretPrefix}' || name WHERE name NOT LIKE 'owner:%';
      UPDATE app_settings SET name='${secretPrefix}' || name WHERE name GLOB 'ai_*'
        OR name GLOB 'jev_*' OR name='writing_style_settings';`);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
} finally {
  db.close();
}
console.log("Legacy unowned records assigned to the verified owner.");
