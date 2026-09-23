// Canlı Jev duman testi: gerçek endpoint, 3 aday × 2 facet, tek istek. Anahtar yalnız env'den okunur, hiç yazdırılmaz.
import { setSetting } from "../src/server/db";
import { jevScore, getJevSettings, jevMode } from "../src/server/jev";

const now = Math.floor(Date.now() / 1000);
const baseUrl = process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai";
setSetting("jev_mode", process.env.SMOKE_MODE || "on", now);
setSetting("jev_provider", "vercel", now);
setSetting("jev_model", "jev-latest", now);
setSetting("jev_base_url", baseUrl, now);
setSetting("jev_timeout_ms", "6000", now);
setSetting("jev_daily_batch_cap", "20", now);

const result = await jevScore({
  query: "Bu post hangi hesap için fırsat?",
  facets: [
    "Teknoloji hesabı: yapay zeka, yazılım, startup haberleri; ciddi, açıklayıcı ton.",
    "Futbol hesabı: transfer, maç sonucu, Süper Lig; hızlı, taraftar tonu.",
  ],
  candidates: [
    { id: "p1", title: "OpenAI yeni model duyurdu", statement: "OpenAI bugün GPT-6'yı duyurdu, kodlama benchmark'larında %30 artış.", scope: "@techsrc", domains: ["technology"] },
    { id: "p2", title: "Galatasaray transferi bitirdi", statement: "Galatasaray, Alman orta saha ile 3 yıllık anlaşmaya vardı, resmi açıklama bekleniyor.", scope: "@sportsrc", domains: ["sports"] },
    { id: "p3", title: "Bugün hava çok güzel", statement: "İstanbul'da güneşli bir gün, sahil doldu.", scope: "@randomsrc", domains: [] },
  ],
  scope: "smoke",
});
console.log(JSON.stringify({ mode: jevMode(), settings: { ...getJevSettings(), baseUrl: "<gizli-host>" }, result }, null, 2));
