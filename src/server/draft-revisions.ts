import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { currentOwnerId } from "./owner-context";
import { ensureDatabase } from "./db";

type Revision = { id: number; draftId: number; revision: number; accountId: number | null; format: string; text: string; externalId: string; sourceHandle: string; sourceUrl: string; createdAt: number };
type Sqlite = { exec(sql: string): void; prepare(sql: string): { all(...values: unknown[]): unknown[] } };
type SqliteCtor = new (path: string) => Sqlite;
const builtin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
const Database: SqliteCtor = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
  ? (builtin("bun:sqlite") as { Database: SqliteCtor }).Database
  : (builtin("node:sqlite") as { DatabaseSync: SqliteCtor }).DatabaseSync;
const databasePath = process.env.ISPATLA_DB || join(process.cwd(), "state", "ispatla.sqlite3");
let database: Sqlite | undefined;
let initialized = false;

function db() {
  if (!ensureDatabase()) throw new Error("database unavailable");
  if (database && initialized) return database;
  mkdirSync(dirname(databasePath), { recursive: true });
  database ||= new Database(databasePath);
  database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
  try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS draft_revisions (
      id INTEGER PRIMARY KEY, draft_id INTEGER NOT NULL, owner_user_id TEXT NOT NULL,
      revision INTEGER NOT NULL, account_id INTEGER, format TEXT NOT NULL, text TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(draft_id, revision)
    );
    CREATE INDEX IF NOT EXISTS draft_revisions_owner_idx ON draft_revisions(owner_user_id, draft_id, revision DESC);
  `);
  const columns=new Set((database.prepare("PRAGMA table_info(draft_revisions)").all() as Array<{name:string}>).map(row=>row.name));
  for(const column of ["external_id","source_handle","source_url"])if(!columns.has(column))database.exec(`ALTER TABLE draft_revisions ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  database.exec(`
    DROP TRIGGER IF EXISTS draft_revision_insert;
    DROP TRIGGER IF EXISTS draft_revision_update;
    INSERT OR IGNORE INTO draft_revisions(draft_id, owner_user_id, revision, account_id, format, text, external_id, source_handle, source_url, created_at)
      SELECT id, owner_user_id, 1, account_id, format, text, external_id, source_handle, source_url, created_at FROM drafts WHERE owner_user_id IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS draft_revision_insert AFTER INSERT ON drafts
      WHEN NEW.owner_user_id IS NOT NULL BEGIN
        INSERT OR IGNORE INTO draft_revisions(draft_id, owner_user_id, revision, account_id, format, text, external_id, source_handle, source_url, created_at)
        VALUES(NEW.id, NEW.owner_user_id, 1, NEW.account_id, NEW.format, NEW.text, NEW.external_id, NEW.source_handle, NEW.source_url, NEW.updated_at);
      END;
    CREATE TRIGGER IF NOT EXISTS draft_revision_update AFTER UPDATE OF account_id, format, text, source_handle, source_url ON drafts
      WHEN NEW.owner_user_id IS NOT NULL AND (OLD.account_id IS NOT NEW.account_id OR OLD.format IS NOT NEW.format OR OLD.text IS NOT NEW.text OR OLD.source_handle IS NOT NEW.source_handle OR OLD.source_url IS NOT NEW.source_url) BEGIN
        INSERT INTO draft_revisions(draft_id, owner_user_id, revision, account_id, format, text, external_id, source_handle, source_url, created_at)
        VALUES(NEW.id, NEW.owner_user_id,
          COALESCE((SELECT MAX(revision) + 1 FROM draft_revisions WHERE draft_id=NEW.id AND owner_user_id=NEW.owner_user_id), 1),
          NEW.account_id, NEW.format, NEW.text, NEW.external_id, NEW.source_handle, NEW.source_url, NEW.updated_at);
      END;
    CREATE TRIGGER IF NOT EXISTS draft_revisions_no_update BEFORE UPDATE ON draft_revisions
      BEGIN SELECT RAISE(ABORT, 'draft revisions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS draft_revisions_no_delete BEFORE DELETE ON draft_revisions
      BEGIN SELECT RAISE(ABORT, 'draft revisions are immutable'); END;
  `);
  database.exec("COMMIT;");
  } catch(error) { database.exec("ROLLBACK;"); throw error; }
  initialized = true;
  return database;
}

export function ensureDraftRevisionStore(): void { db(); }

export function getDraftRevisions(draftId: number): Revision[] {
  const ownerId = currentOwnerId();
  if (!ownerId || !Number.isSafeInteger(draftId) || draftId < 1) return [];
  return db().prepare(`SELECT id, draft_id AS draftId, revision, account_id AS accountId, format, text, external_id AS externalId, source_handle AS sourceHandle, source_url AS sourceUrl, created_at AS createdAt
    FROM draft_revisions WHERE draft_id=? AND owner_user_id=? ORDER BY revision DESC`).all(draftId, ownerId) as Revision[];
}
