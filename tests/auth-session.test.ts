import { expect, test } from "bun:test";
import { createAuthRuntime, initializeAuthDatabase } from "../src/server/auth";

test("auth runtime refuses to fall back when DATABASE_URL is absent", async () => {
  await expect(createAuthRuntime({ env: {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    BETTER_AUTH_URL: "http://localhost:3000",
  } })).rejects.toThrow("DATABASE_URL is required for PostgreSQL auth");

  await expect(initializeAuthDatabase({ env: { NODE_ENV: "test" } })).rejects.toThrow("DATABASE_URL is required for PostgreSQL auth");
});
