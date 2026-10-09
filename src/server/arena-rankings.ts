const HF_ROWS = "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&offset=0&length=100";
const CACHE_MS = 10 * 60 * 1000;
type ArenaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type ArenaModel = { rank: number; name: string; organization: string; rating: number; votes: number; updatedAt: string };
export type ArenaResult = { available: boolean; models: ArenaModel[]; updatedAt: string | null };
let cached: { expiresAt: number; value: ArenaResult } | null = null;
const EMPTY: ArenaResult = { available: false, models: [], updatedAt: null };
function obj(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function parseArenaRows(payload: unknown): ArenaResult {
  const rows = obj(payload).rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return EMPTY;
  const normalized: ArenaModel[] = [];
  for (const entry of rows) {
    const row = obj(obj(entry).row);
    const rank = Number(row.rank); const rating = Number(row.rating); const votes = Number(row.vote_count);
    const name = typeof row.model_name === "string" ? row.model_name.trim() : "";
    const organization = typeof row.organization === "string" ? row.organization.trim() : "";
    const updatedAt = typeof row.leaderboard_publish_date === "string" ? row.leaderboard_publish_date : "";
    if (!name || name.length > 160 || !organization || organization.length > 80 || !Number.isInteger(rank) || rank < 1 || rank > 1000 || !Number.isFinite(rating) || rating < 0 || rating > 3000 || !Number.isFinite(votes) || votes < 0 || votes > 1e9 || !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) continue;
    if (row.category !== "overall") continue;
    normalized.push({ rank, name, organization, rating: Math.round(rating * 10) / 10, votes: Math.round(votes), updatedAt });
  }
  const models = normalized.sort((a, b) => a.rank - b.rank).slice(0, 24);
  if (!models.length) return EMPTY;
  return { available: true, models, updatedAt: models[0].updatedAt };
}

export async function getArenaRankings(fetcher: ArenaFetch = fetch, now = Date.now()): Promise<ArenaResult> {
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const response = await fetcher(HF_ROWS, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) throw new Error("dataset unavailable");
    const result = parseArenaRows(await response.json());
    if (!result.available) throw new Error("invalid dataset");
    cached = { value: result, expiresAt: now + CACHE_MS };
    return result;
  } catch {
    if (cached) return cached.value;
    cached = { value: EMPTY, expiresAt: now + 30_000 };
    return EMPTY;
  }
}

export function resetArenaCacheForTests(): void { cached = null; }
