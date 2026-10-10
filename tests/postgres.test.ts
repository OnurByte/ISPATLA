import { afterAll, expect, test } from "bun:test";
import { getPostgresPool } from "../src/server/postgres";

const original = process.env.DATABASE_URL;
let pool: ReturnType<typeof getPostgresPool> | undefined;

afterAll(async () => {
  if (original === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original;
  await pool?.end();
});

test("PostgreSQL pool validates DATABASE_URL and initializes lazily", () => {
  process.env.DATABASE_URL = "https://example.com/db";
  expect(() => getPostgresPool()).toThrow("DATABASE_URL must be the full PostgreSQL URI from Supabase Connect");

  process.env.DATABASE_URL = "postgresql://db.example.com:not-a-port";
  expect(() => getPostgresPool()).toThrow("DATABASE_URL must be the full PostgreSQL URI from Supabase Connect");

  process.env.DATABASE_URL = "postgresql://postgres.project-ref:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require";
  pool = getPostgresPool();
  expect(pool.options.max).toBe(5);
  if (!pool.options.ssl || typeof pool.options.ssl !== "object") throw new Error("Supabase SSL verification is required");
  expect(pool.options.ssl.rejectUnauthorized).toBe(true);
  expect(pool.options.ssl.ca).toContain("BEGIN CERTIFICATE");
});
