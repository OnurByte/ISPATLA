// Deterministic synthetic ObservedPost-like inputs for opportunity-scoring snapshots.
// No randomness, no database, no clock: every timestamp is derived from FIXTURE_NOW so
// the same fixture produces byte-identical output on every run and every machine.
// Used by scripts/fixture-snapshot.ts to record before/after scoring behaviour.

/** Frozen "current time" (unix seconds). All ages are relative to this. */
export const FIXTURE_NOW = 1_750_000_000;

const hours = (value: number): number => FIXTURE_NOW - Math.round(value * 3600);

export type OpportunityFixturePost = {
  externalId: string;
  sourceHandle: string;
  authorHandle: string;
  text: string;
  clusterKey: string;
  createdTimestamp: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views: number;
  followers: number;
  mediaCount: number;
  sensitive: boolean;
};

export const OPPORTUNITY_FIXTURE: readonly OpportunityFixturePost[] = [
  // Very fresh, very fast, media: expected top-of-pool and a numerical hit.
  { externalId: "f01", sourceHandle: "haberturk", authorHandle: "haberturk", text: "Merkez bankasi faiz karari aciklandi", clusterKey: "merkez-bankasi-faiz-karari-aciklandi", createdTimestamp: hours(0.1), likes: 4200, replies: 910, reposts: 1800, quotes: 340, views: 480_000, followers: 3_100_000, mediaCount: 2, sensitive: false },
  // Same cluster as f01, different source: diversity filter should drop it.
  { externalId: "f02", sourceHandle: "ntv", authorHandle: "ntv", text: "Merkez bankasi faiz karari aciklandi bugun", clusterKey: "merkez-bankasi-faiz-karari-aciklandi", createdTimestamp: hours(0.2), likes: 3100, replies: 640, reposts: 1400, quotes: 260, views: 360_000, followers: 2_400_000, mediaCount: 1, sensitive: false },
  // Same source as f01, different cluster: diversity filter should drop it.
  { externalId: "f03", sourceHandle: "haberturk", authorHandle: "haberturk", text: "Deprem sonrasi saha ekipleri bolgeye ulasti", clusterKey: "deprem-sonrasi-saha-ekipleri-bolgeye-ulasti", createdTimestamp: hours(0.4), likes: 2600, replies: 480, reposts: 1100, quotes: 190, views: 290_000, followers: 3_100_000, mediaCount: 3, sensitive: false },
  // Fresh, fast, no media: media bonus absent.
  { externalId: "f04", sourceHandle: "anadoluajansi", authorHandle: "anadoluajansi", text: "Kabine toplantisi sona erdi aciklama bekleniyor", clusterKey: "kabine-toplantisi-sona-erdi-aciklama-bekleniyor", createdTimestamp: hours(0.5), likes: 1900, replies: 420, reposts: 860, quotes: 150, views: 210_000, followers: 1_800_000, mediaCount: 0, sensitive: false },
  // Just inside the 2h hit window.
  { externalId: "f05", sourceHandle: "sozcu", authorHandle: "sozcu", text: "Istanbul trafiginde yogunluk yuzde altmisa ulasti", clusterKey: "istanbul-trafiginde-yogunluk-yuzde-altmisa-ulasti", createdTimestamp: hours(1.9), likes: 2400, replies: 510, reposts: 980, quotes: 170, views: 260_000, followers: 2_000_000, mediaCount: 1, sensitive: false },
  // Just outside the 2h hit window, otherwise identical shape to f05.
  { externalId: "f06", sourceHandle: "cumhuriyet", authorHandle: "cumhuriyet", text: "Istanbul trafik duzenlemesi yarin basliyor", clusterKey: "istanbul-trafik-duzenlemesi-yarin-basliyor", createdTimestamp: hours(2.2), likes: 2400, replies: 510, reposts: 980, quotes: 170, views: 260_000, followers: 2_000_000, mediaCount: 1, sensitive: false },
  // Sensitive: score floors at 0, risk 100, must be excluded everywhere.
  { externalId: "f07", sourceHandle: "adliyehaber", authorHandle: "adliyehaber", text: "Sokak ortasinda silahli saldiri goruntuleri", clusterKey: "sokak-ortasinda-silahli-saldiri-goruntuleri", createdTimestamp: hours(0.3), likes: 5200, replies: 1200, reposts: 2400, quotes: 400, views: 610_000, followers: 900_000, mediaCount: 2, sensitive: true },
  // High views, low engagement: views term caps, rate term small.
  { externalId: "f08", sourceHandle: "trthaber", authorHandle: "trthaber", text: "Hava durumu raporu hafta sonu icin guncellendi", clusterKey: "hava-durumu-raporu-hafta-sonu-icin-guncellendi", createdTimestamp: hours(1.2), likes: 90, replies: 12, reposts: 25, quotes: 4, views: 540_000, followers: 1_500_000, mediaCount: 1, sensitive: false },
  // Low views, high engagement rate: rate term caps.
  { externalId: "f09", sourceHandle: "ekonomimasasi", authorHandle: "ekonomimasasi", text: "Dolar kuru gun icinde yeni zirveyi gordu", clusterKey: "dolar-kuru-gun-icinde-yeni-zirveyi-gordu", createdTimestamp: hours(1.0), likes: 780, replies: 210, reposts: 340, quotes: 90, views: 9_000, followers: 41_000, mediaCount: 0, sensitive: false },
  // Mid age (6h): freshness decays to 76.
  { externalId: "f10", sourceHandle: "dunyagazetesi", authorHandle: "dunyagazetesi", text: "Ihracat rakamlari aylik bazda yukseldi", clusterKey: "ihracat-rakamlari-aylik-bazda-yukseldi", createdTimestamp: hours(6), likes: 1400, replies: 260, reposts: 610, quotes: 110, views: 180_000, followers: 700_000, mediaCount: 2, sensitive: false },
  // Old but inside the 24h window (18h): freshness 28.
  { externalId: "f11", sourceHandle: "bloomberght", authorHandle: "bloomberght", text: "Borsa istanbul gunu yukselisle tamamladi", clusterKey: "borsa-istanbul-gunu-yukselisle-tamamladi", createdTimestamp: hours(18), likes: 2900, replies: 520, reposts: 1200, quotes: 240, views: 340_000, followers: 1_100_000, mediaCount: 1, sensitive: false },
  // Expired (25h): outside OPPORTUNITY_MAX_AGE_SECONDS, freshness 0.
  { externalId: "f12", sourceHandle: "fanatik", authorHandle: "fanatik", text: "Transfer doneminin son gunu icin beklenti buyuk", clusterKey: "transfer-doneminin-son-gunu-icin-beklenti-buyuk", createdTimestamp: hours(25), likes: 6100, replies: 1300, reposts: 2600, quotes: 480, views: 720_000, followers: 2_800_000, mediaCount: 3, sensitive: false },
  // Zero engagement, zero views.
  { externalId: "f13", sourceHandle: "kucukhesap", authorHandle: "kucukhesap", text: "Bugun hava cok guzel", clusterKey: "bugun-hava-cok-guzel", createdTimestamp: hours(0.6), likes: 0, replies: 0, reposts: 0, quotes: 0, views: 0, followers: 120, mediaCount: 0, sensitive: false },
  // Empty clusterKey: diversity filter must not treat it as a cluster collision.
  { externalId: "f14", sourceHandle: "ajansmuhabir", authorHandle: "ajansmuhabir", text: "...", clusterKey: "", createdTimestamp: hours(0.8), likes: 1600, replies: 300, reposts: 700, quotes: 130, views: 150_000, followers: 380_000, mediaCount: 0, sensitive: false },
  // Second empty clusterKey, different source: both must survive the cluster check.
  { externalId: "f15", sourceHandle: "yerelgazete", authorHandle: "yerelgazete", text: "??", clusterKey: "", createdTimestamp: hours(1.4), likes: 1500, replies: 280, reposts: 660, quotes: 120, views: 140_000, followers: 300_000, mediaCount: 1, sensitive: false },
  // Future-dated inside the +300s tolerance: still a current opportunity.
  { externalId: "f16", sourceHandle: "sondakika", authorHandle: "sondakika", text: "Son dakika aciklama az once geldi", clusterKey: "son-dakika-aciklama-az-once-geldi", createdTimestamp: FIXTURE_NOW + 120, likes: 300, replies: 60, reposts: 140, quotes: 25, views: 22_000, followers: 640_000, mediaCount: 1, sensitive: false },
];

/**
 * FAKE relevance percentages (0-100) for the snapshot's version-2 fields, as a Jev
 * batch would have persisted them. No network and no model is involved: these are
 * fixed numbers chosen to exercise the layered score, including posts with no
 * relevance evidence at all (null -> factor 1.0 -> legacy behaviour).
 */
export const FIXTURE_RELEVANCE: Record<string, number | null> = {
  f01: 20,   // strongly relevant locally, weakly relevant to the accounts: must fall
  f02: 95,
  f03: null, // no relevance evidence: legacy score preserved
  f04: 100,
  f05: 90,
  f06: 55,
  f07: 80,   // sensitive: risk 100 keeps it at 0 regardless of relevance
  f08: 0,
  f09: null,
  f10: 100,
  f11: 70,
  f12: 100,  // expired: freshness 0 keeps it at 0
  f13: 100,
  f14: 30,
  f15: 100,
  f16: 45,
};
