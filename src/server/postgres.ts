import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { postgresSchema } from "./postgres-schema";
import { postgresQueueSchema } from "./postgres-queue-schema";
import { SUPABASE_DATABASE_CA } from "./supabase-ca";

const schema = { ...postgresSchema, ...postgresQueueSchema };

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getPostgresPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL auth");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be the full PostgreSQL URI from Supabase Connect, including credentials, host, port, and database");
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol)) || !url.hostname || !url.username || !url.password || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must be the full PostgreSQL URI from Supabase Connect, including credentials, host, port, and database");
  }
  if (!pool) {
    const isSupabase = url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com");
    if (isSupabase) {
      for (const key of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"]) url.searchParams.delete(key);
    }
    pool = new Pool({
      connectionString: isSupabase ? url.toString() : connectionString,
      ...(isSupabase ? { ssl: { ca: SUPABASE_DATABASE_CA, rejectUnauthorized: true } } : {}),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export function getPostgresDb(): NodePgDatabase<typeof schema> {
  if (!database) database = drizzle({ client: getPostgresPool(), schema });
  return database;
}
