// Env-file support for the standalone worker.
//
// systemd loads ~/.config/ispatla/worker.env through EnvironmentFile=, but the same
// worker is also started by hand (`bun run automation:worker`), where nothing reads
// that file. This module parses it the same way and never overwrites a variable that
// is already set, so the shell and systemd both stay authoritative.
//
// Values are secrets: nothing here logs, returns or stringifies a value — only names.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_WORKER_ENV_PATH = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "ispatla", "worker.env");

/** Parses `KEY=value` lines. Comments, blanks and malformed lines are skipped. */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) continue;
    const name = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = withoutExport.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
      value = value.slice(1, -1);
    }
    result[name] = value;
  }
  return result;
}

/**
 * Applies the env file into process.env without clobbering existing variables.
 * Returns the loaded variable NAMES (never values) and whether the file existed.
 */
export function loadWorkerEnv(path = process.env.ISPATLA_WORKER_ENV || DEFAULT_WORKER_ENV_PATH, env: Record<string, string | undefined> = process.env): { path: string; found: boolean; applied: string[]; skipped: string[] } {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return { path, found: false, applied: [], skipped: [] };
  }
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [name, value] of Object.entries(parseEnvFile(content))) {
    if (env[name] !== undefined && env[name] !== "") {
      skipped.push(name);
      continue;
    }
    env[name] = value;
    applied.push(name);
  }
  return { path, found: true, applied, skipped };
}
