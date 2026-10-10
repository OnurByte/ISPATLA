import { afterEach, expect, test } from "bun:test";
import { decryptPostgresSecret, encryptPostgresSecret } from "../src/server/postgres-settings";

const originalKey = process.env.ISPATLA_SECRET_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ISPATLA_SECRET_KEY;
  else process.env.ISPATLA_SECRET_KEY = originalKey;
});

test("PostgreSQL settings vault uses the existing authenticated ciphertext envelope", () => {
  process.env.ISPATLA_SECRET_KEY = "test-only-secret-key";
  const encrypted = encryptPostgresSecret("provider-token");
  expect(encrypted).toMatch(/^v1:/);
  expect(decryptPostgresSecret(encrypted)).toBe("provider-token");
  expect(encrypted).not.toContain("provider-token");
});

test("PostgreSQL settings vault rejects corrupted ciphertext", () => {
  process.env.ISPATLA_SECRET_KEY = "test-only-secret-key";
  expect(() => decryptPostgresSecret("v1:bad:bad:bad")).toThrow();
});
