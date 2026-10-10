import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkerEnv, parseEnvFile } from "../scripts/worker-env";

test("worker env parsing preserves values and ignores invalid lines", () => {
  expect(parseEnvFile([
    "# comment", "", "DATABASE_URL=postgresql://localhost/app", 'export JEV_API_KEY="secret-value"',
    "QUOTED='single'", "  SPACED = value with spaces  ", "no-equals-line", "1BAD=nope",
  ].join("\n"))).toEqual({
    DATABASE_URL: "postgresql://localhost/app", JEV_API_KEY: "secret-value", QUOTED: "single", SPACED: "value with spaces",
  });
});

test("worker env loading does not overwrite the process environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-env-"));
  const file = join(directory, "worker.env");
  try {
    writeFileSync(file, "DATABASE_URL=postgresql://from-file/app\nJEV_API_KEY=from-file\n");
    const env: Record<string, string | undefined> = { DATABASE_URL: "postgresql://already-set/app" };
    const result = loadWorkerEnv(file, env);
    expect(result).toMatchObject({ found: true, applied: ["JEV_API_KEY"], skipped: ["DATABASE_URL"] });
    expect(env.DATABASE_URL).toBe("postgresql://already-set/app");
    expect(env.JEV_API_KEY).toBe("from-file");
    expect(loadWorkerEnv(join(directory, "absent.env"), {})).toMatchObject({ found: false, applied: [], skipped: [] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
