// Manuel hesap için Jev fırsat sıralamasını bir kez çalıştırır (yayın yok). Anahtar env'den.
import { candidates, getAccounts, getCategories } from "../src/server/db";
import { rankOpportunityBatch } from "../src/server/opportunity-batch";
const now = Math.floor(Date.now() / 1000);
const posts = candidates(32, now);
const accounts = getAccounts().filter((a) => a.enabled);
const result = await rankOpportunityBatch({ posts, accounts, categories: getCategories(), now });
const ranked = posts
  .map((p) => ({ id: p.externalId, src: p.sourceHandle, rel: result.relevance[p.externalId] ?? null, score: Math.round(p.score), text: p.text.replace(/\s+/g, " ").slice(0, 110) }))
  .sort((a, b) => (b.rel ?? -1) - (a.rel ?? -1));
console.log(JSON.stringify({ candidates: posts.length, calls: result.calls, degraded: result.degraded, diagnostics: result.diagnostics, top: ranked.slice(0, 10), bottom: ranked.slice(-3) }, null, 1));
