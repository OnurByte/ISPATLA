import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceConfig, SourceProfile } from "@/server/db-types";

type RawSource = { handle?: unknown; name?: unknown; enabled?: unknown; maxPosts?: unknown; rightsStatus?: unknown; profile?: unknown };
export function asNiche(value: unknown): string { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 180); }
export function asTone(value: unknown): string { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 140); }
export function asTopics(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(values.map((topic) => String(topic).trim().replace(/\s+/g, " ").slice(0, 60)).filter(Boolean))].slice(0, 8);
}

/** Global discovery catalog only; per-user selections and settings live in PostgreSQL. */
export function loadSourceCatalog(): SourceConfig[] {
  const path = process.env.ISPATLA_SOURCES || join(process.cwd(), "config", "sources.json");
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { sources?: RawSource[] };
    return (Array.isArray(parsed.sources) ? parsed.sources : []).flatMap((raw) => {
      const handle = String(raw.handle || "").replace(/^@/, "").trim().toLowerCase();
      if (!/^[a-z0-9_]{1,15}$/.test(handle)) return [];
      return [{ handle, name: String(raw.name || handle), enabled: raw.enabled !== false, maxPosts: Math.min(50, Math.max(1, Number(raw.maxPosts || 20))),
        rightsStatus: raw.rightsStatus === "cleared" || raw.rightsStatus === "prohibited" ? raw.rightsStatus : "unknown",
        profile: raw.profile && typeof raw.profile === "object" && !Array.isArray(raw.profile) ? raw.profile as SourceProfile : {} } satisfies SourceConfig];
    });
  } catch { return []; }
}
