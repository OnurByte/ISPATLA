/**
 * Canlı uçtan uca Jev doğrulaması (Faz B3).
 *
 * Ağ yalnız Jev'e çıkar: X/FxTwitter, diğer sağlayıcılar hiç çağrılmaz, veriler
 * doğrudan db yardımcılarıyla tohumlanır. Anahtar yalnız JEV_API_KEY env'inden
 * okunur, hiçbir yere yazılmaz; taban URL çıktıda maskelenir.
 *
 * Kullanım (anahtar aynı komutun içinde yüklenir):
 *   ISPATLA_DB=$PWD/state/live-e2e.sqlite3 bun scripts/jev-live-e2e.ts
 */
import { Database } from "bun:sqlite";
import {
  candidates,
  ensureDatabase,
  getAccountCategoryConfigs,
  getAccounts,
  getCategories,
  getSetting,
  opportunityScoreForPost,
  saveAccount,
  saveAccountCategoryConfig,
  saveSourceCategoryConfig,
  setSetting,
  upsertPost,
  upsertSource,
  type Account,
} from "../src/server/db";
import { getJevSettings } from "../src/server/jev";
import { dayKey, preferredRelevanceAccount, rankOpportunityBatch } from "../src/server/opportunity-batch";
import { clusterKey, scorePost, selectDiverseCandidates } from "../src/server/scoring";

const NOW = Math.floor(Date.now() / 1000);
const BASE_URL = process.env.TYPESAFE_BASE_URL || "";

if (!ensureDatabase()) throw new Error("veritabanı açılmadı");
if (!process.env.JEV_API_KEY) throw new Error("JEV_API_KEY yok");
if (!BASE_URL) throw new Error("TYPESAFE_BASE_URL yok");

// --- ayarlar ---------------------------------------------------------------
setSetting("jev_mode", "on", NOW);
setSetting("jev_provider", "vercel", NOW);
setSetting("jev_model", "jev-latest", NOW);
setSetting("jev_base_url", BASE_URL, NOW);
setSetting("jev_timeout_ms", "6000", NOW);
setSetting("jev_daily_batch_cap", "8", NOW);

// --- hesaplar --------------------------------------------------------------
const categories = getCategories();
const technology = categories.find((category) => category.slug === "technology");
const sports = categories.find((category) => category.slug === "sports");
if (!technology || !sports) throw new Error("yerleşik kategoriler bulunamadı");

const ACCOUNTS: Array<{ handle: string; niche: string; categoryId: number }> = [
  { handle: "teknohaber", niche: "Yapay zeka, yazılım, çip ve startup haberleri; ciddi ve açıklayıcı ton.", categoryId: technology.id },
  { handle: "futbolgundem", niche: "Süper Lig, transfer ve maç sonuçları; hızlı, taraftar tonu.", categoryId: sports.id },
];

for (const [index, entry] of ACCOUNTS.entries()) {
  const account = saveAccount({
    accountKey: entry.handle,
    handle: entry.handle,
    displayName: entry.handle,
    enabled: true,
    defaultAccount: index === 0,
    automationMode: "auto",
    dailyLimit: 24,
    capabilities: ["post"],
    styleProfile: { niche: entry.niche, categories: [entry.categoryId === technology.id ? technology.slug : sports.slug] },
    now: NOW,
  });
  saveAccountCategoryConfig({
    accountId: account.id,
    categoryId: entry.categoryId,
    enabled: true,
    primary: true,
    weight: 1,
    priority: 1,
    publishThreshold: null,
    dailyBudget: null,
    styleOverride: {},
    aiRouteOverride: {},
  });
}

// --- kaynaklar ve postlar --------------------------------------------------
type Seed = { id: string; source: string; text: string; ageMinutes: number; likes: number; reposts: number; replies: number; views: number; followers: number };

const SOURCES: Array<{ handle: string; categoryId: number }> = [
  { handle: "teknokaynak", categoryId: technology.id },
  { handle: "sporkaynak", categoryId: sports.id },
  { handle: "gundemkaynak", categoryId: technology.id },
];

const SEEDS: Seed[] = [
  { id: "t1", source: "teknokaynak", text: "OpenAI yeni akıl yürütme modelini duyurdu: kodlama kıyaslamalarında %28 artış, fiyat sabit kaldı.", ageMinutes: 20, likes: 4200, reposts: 900, replies: 310, views: 620_000, followers: 180_000 },
  { id: "t2", source: "teknokaynak", text: "NVIDIA veri merkezi çiplerinde yeni nesil mimariyi tanıttı; bellek bant genişliği iki katına çıkıyor.", ageMinutes: 55, likes: 2600, reposts: 540, replies: 180, views: 410_000, followers: 180_000 },
  { id: "t3", source: "gundemkaynak", text: "Yerli bir yazılım girişimi 12 milyon dolar A serisi yatırım aldı; ekip 40 kişiye çıkacak.", ageMinutes: 95, likes: 1500, reposts: 280, replies: 140, views: 190_000, followers: 95_000 },
  { id: "t4", source: "teknokaynak", text: "Kritik güvenlik açığı: yaygın kullanılan bir kütüphanede uzaktan kod çalıştırma zafiyeti yamalandı, güncelleme şart.", ageMinutes: 40, likes: 3100, reposts: 1100, replies: 220, views: 480_000, followers: 180_000 },
  { id: "s1", source: "sporkaynak", text: "Galatasaray, Alman orta saha oyuncusuyla 3 yıllık sözleşmede anlaştı; resmi açıklama bu akşam.", ageMinutes: 25, likes: 5200, reposts: 1400, replies: 620, views: 780_000, followers: 240_000 },
  { id: "s2", source: "sporkaynak", text: "Fenerbahçe deplasmanda 2-1 kazandı; maçın son dakikasında penaltı kararı tartışma yarattı.", ageMinutes: 70, likes: 3800, reposts: 900, replies: 540, views: 560_000, followers: 240_000 },
  { id: "s3", source: "gundemkaynak", text: "Süper Lig'de haftanın maçı öncesi iki takımın da sakat oyuncu listesi açıklandı.", ageMinutes: 110, likes: 1400, reposts: 260, replies: 190, views: 170_000, followers: 95_000 },
  { id: "s4", source: "sporkaynak", text: "Milli takım kadrosu açıklandı: üç yeni isim listeye girdi, kaptanlık bandı değişmedi.", ageMinutes: 140, likes: 2200, reposts: 480, replies: 300, views: 300_000, followers: 240_000 },
  { id: "n1", source: "gundemkaynak", text: "İstanbul'da hava bugün güneşli, sahil yolu kalabalık; hafta sonu sıcaklık artıyor.", ageMinutes: 35, likes: 2400, reposts: 400, replies: 160, views: 330_000, followers: 95_000 },
  { id: "n2", source: "gundemkaynak", text: "Şehir merkezinde yeni açılan bir kahvecinin önünde uzun kuyruk oluştu.", ageMinutes: 80, likes: 1700, reposts: 300, replies: 130, views: 220_000, followers: 95_000 },
  { id: "n3", source: "gundemkaynak", text: "Metro hattında bakım çalışması nedeniyle seferler yarım saat gecikmeli ilerliyor.", ageMinutes: 60, likes: 1900, reposts: 350, replies: 210, views: 260_000, followers: 95_000 },
];

for (const source of SOURCES) {
  upsertSource({ handle: source.handle, name: source.handle, enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active" } }, NOW);
  saveSourceCategoryConfig({
    sourceHandle: source.handle,
    categoryId: source.categoryId,
    monitoringTier: "A",
    discoveryWeight: 1,
    categoryReputation: null,
    enabled: true,
    lastEvidenceAt: 0,
  });
}

for (const seed of SEEDS) {
  const createdTimestamp = NOW - seed.ageMinutes * 60;
  const scored = scorePost({
    likes: seed.likes, replies: seed.replies, reposts: seed.reposts, quotes: 0, views: seed.views,
    createdTimestamp, mediaCount: 0, sensitive: false, followers: seed.followers, now: NOW,
  });
  upsertPost({
    externalId: seed.id,
    sourceHandle: seed.source,
    authorHandle: seed.source,
    statusUrl: `https://x.com/${seed.source}/status/${seed.id}`,
    text: seed.text,
    createdTimestamp,
    likes: seed.likes, replies: seed.replies, reposts: seed.reposts, quotes: 0, views: seed.views,
    followers: seed.followers, mediaCount: 0, mediaJson: "[]", rawJson: "{}",
    score: scored.score, scoreReason: scored.reason, sensitive: false,
    clusterKey: clusterKey(seed.text),
  }, NOW);
}

const pool = candidates(32, NOW);
if (pool.length < 8) throw new Error(`aday havuzu çok küçük: ${pool.length}`);

// --- canlı çağrı -----------------------------------------------------------
const accounts = getAccounts().filter((account) => account.enabled);
const started = Date.now();
const result = await rankOpportunityBatch({
  posts: pool,
  accounts,
  categories: getCategories(),
  accountConfigurations: getAccountCategoryConfigs(),
  sourceDomains: (post) => (post.sourceHandle === "sporkaynak" ? [sports.slug] : [technology.slug]),
  localScore: (post) => opportunityScoreForPost(post, NOW),
  now: NOW,
});
const wallMs = Date.now() - started;

const byHandle = new Map(accounts.map((account) => [account.id, account.handle] as const));
const matrix = SEEDS.map((seed) => ({
  id: seed.id,
  perAccount: Object.fromEntries(
    Object.entries(result.perAccount[seed.id] || {}).map(([accountId, value]) => [byHandle.get(Number(accountId)) || accountId, value]),
  ),
  relevance: result.relevance[seed.id] ?? null,
}));

// --- on vs off -------------------------------------------------------------
const onOrder = candidates(24, NOW).map((post) => post.externalId);
const onScores = candidates(24, NOW).map((post) => ({ id: post.externalId, score: opportunityScoreForPost(post, NOW) }));
const onDiverse = selectDiverseCandidates(candidates(24, NOW), 6).map((post) => post.externalId);
setSetting("jev_mode", "off", NOW);
const offOrder = candidates(24, NOW).map((post) => post.externalId);
const offScores = candidates(24, NOW).map((post) => ({ id: post.externalId, score: opportunityScoreForPost(post, NOW) }));
const offDiverse = selectDiverseCandidates(candidates(24, NOW), 6).map((post) => post.externalId);
setSetting("jev_mode", "on", NOW);

// --- hesap tercihi ---------------------------------------------------------
const preferred = ["t1", "s1", "n1"].map((id) => {
  const post = candidates(32, NOW).find((item) => item.externalId === id);
  const choice: Account | undefined = post ? preferredRelevanceAccount(accounts, post) : undefined;
  return { id, account: choice ? choice.handle : null };
});

// --- tavan davranışı (ağa çıkmaz: ilk tekrar önbellekten, ikinci tavandan döner) ---
setSetting("jev_daily_batch_cap", "1", NOW);
setSetting(dayKey(NOW), "0", NOW);
const capFirst = await rankOpportunityBatch({
  posts: pool, accounts, categories: getCategories(), accountConfigurations: getAccountCategoryConfigs(),
  sourceDomains: (post) => (post.sourceHandle === "sporkaynak" ? [sports.slug] : [technology.slug]),
  localScore: (post) => opportunityScoreForPost(post, NOW), now: NOW,
});
const capSecond = await rankOpportunityBatch({
  posts: pool, accounts, categories: getCategories(), accountConfigurations: getAccountCategoryConfigs(),
  sourceDomains: (post) => (post.sourceHandle === "sporkaynak" ? [sports.slug] : [technology.slug]),
  localScore: (post) => opportunityScoreForPost(post, NOW), now: NOW,
});
setSetting("jev_daily_batch_cap", "8", NOW);

const database = new Database(process.env.ISPATLA_DB || "", { strict: true, readonly: true });
const usage = database.query("SELECT kind, provider, model, estimated_usd, metadata_json, created_at FROM usage_events WHERE kind='score:jev' ORDER BY id").all();
const ledger = database.query("SELECT COUNT(*) AS rows, COUNT(DISTINCT subject_id) AS subjects, COUNT(DISTINCT question_key) AS questions FROM jev_scores WHERE subject_kind='post'").get();
const decisions = database.query("SELECT post_external_id, reason_code, details_json FROM decision_records WHERE reason_code='jev_rank' ORDER BY id").all();
const relevanceColumns = database.query("SELECT external_id, relevance_score, relevance_source, relevance_at FROM observed_posts WHERE relevance_score IS NOT NULL ORDER BY external_id").all();

const settings = getJevSettings();
console.log(JSON.stringify({
  settings: { ...settings, baseUrl: "<yerel-gateway>" },
  poolSize: pool.length,
  accounts: accounts.map((account) => ({ id: account.id, handle: account.handle })),
  call: {
    calls: result.calls,
    degraded: result.degraded,
    diagnostics: result.diagnostics,
    changedDuringEvaluation: result.changedDuringEvaluation,
    wallMs,
  },
  matrix,
  localOrder: result.localOrder,
  jevOrder: result.jevOrder,
  onOrder,
  offOrder,
  onDiverse,
  offDiverse,
  onScores,
  offScores,
  preferred,
  usage,
  ledger,
  decisionCount: decisions.length,
  decisionDetails: decisions.map((row) => JSON.parse((row as { details_json: string }).details_json)),
  relevanceColumns,
  cap: {
    first: { calls: capFirst.calls, capped: capFirst.capped, diagnostics: capFirst.diagnostics },
    second: { calls: capSecond.calls, capped: capSecond.capped, diagnostics: capSecond.diagnostics },
    callsToday: getSetting(dayKey(NOW), "0"),
  },
}, null, 2));
