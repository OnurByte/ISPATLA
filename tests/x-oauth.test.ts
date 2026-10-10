import { afterEach, describe, expect, test } from "bun:test";
import { postgresXOAuthInternals, POSTGRES_X_OAUTH_SCOPES } from "../src/server/postgres-x-oauth";

const saved = { current: process.env.ISPATLA_TOKEN_KEY_CURRENT, vault: process.env.ISPATLA_SECRET_KEY, previous: process.env.ISPATLA_TOKEN_KEY_PREVIOUS_old };
afterEach(() => {
  if (saved.current === undefined) delete process.env.ISPATLA_TOKEN_KEY_CURRENT;
  else process.env.ISPATLA_TOKEN_KEY_CURRENT = saved.current;
  if (saved.vault === undefined) delete process.env.ISPATLA_SECRET_KEY;
  else process.env.ISPATLA_SECRET_KEY = saved.vault;
  if (saved.previous === undefined) delete process.env.ISPATLA_TOKEN_KEY_PREVIOUS_old;
  else process.env.ISPATLA_TOKEN_KEY_PREVIOUS_old = saved.previous;
});

describe("PostgreSQL X OAuth credential envelope", () => {
  test("uses the least required X OAuth scopes", () => {
    expect(POSTGRES_X_OAUTH_SCOPES).toEqual(["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"]);
  });

  test("encrypts credentials and supports configured key rotation", () => {
    const oldKey = "old-test-token-key";
    process.env.ISPATLA_TOKEN_KEY_CURRENT = oldKey;
    delete process.env.ISPATLA_SECRET_KEY;
    const sealed = postgresXOAuthInternals.seal("refresh-token-secret");
    expect(sealed.value).not.toContain("refresh-token-secret");
    process.env.ISPATLA_TOKEN_KEY_CURRENT = "new-test-token-key";
    process.env.ISPATLA_TOKEN_KEY_PREVIOUS_old = oldKey;
    expect(postgresXOAuthInternals.open(sealed.value)).toBe("refresh-token-secret");
    delete process.env.ISPATLA_TOKEN_KEY_PREVIOUS_old;
    expect(() => postgresXOAuthInternals.open(sealed.value)).toThrow("decryption");
  });

  test("rejects malformed or tampered credential envelopes", () => {
    process.env.ISPATLA_TOKEN_KEY_CURRENT = "test-token-key";
    delete process.env.ISPATLA_SECRET_KEY;
    const sealed = postgresXOAuthInternals.seal("access-token-secret");
    expect(() => postgresXOAuthInternals.open("not-an-envelope")).toThrow("invalid");
    expect(() => postgresXOAuthInternals.open(`${sealed.value.slice(0, -2)}xx`)).toThrow();
  });
});
