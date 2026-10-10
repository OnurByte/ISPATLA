# Fırsat puanlama — ilgililik duyarlı tazelik

Saf fonksiyonlar `src/server/scoring.ts`; PostgreSQL fırsat deposu skorları bu fonksiyonlarla hesaplar.
İlgililik (`relevance`, 0–100) Jev toplu sıralamasının posta yazdığı değerdir
(`observed_posts.relevance_score`), yalnız `jev_mode = "on"` iken karara girer.

## Momentum (değişmedi)

```
momentum = clamp(0..100,
  log1p(velocity)*8 + min(18, log1p(views)*1.4) + min(18, log1p(rate*1000)*5)
  + (media ? 5 : 0) - (sensitive ? 100 : 0))
risk = sensitive ? 100 : momentum < 70 ? 45 : 15
```

## Tazelik

24 saatlik fırsat penceresi (`isCurrentOpportunity`) değişmedi; ilgililik pencereyi
uzatmaz, yalnız pencere içindeki düşüş hızını değiştirir.

```
decay(relevance) =
  null            -> 4 puan/saat        (eski davranış, bire bir)
  relevance >= 80 -> 2 puan/saat
  relevance <= 20 -> 6 puan/saat
  aradaki değer   -> 6 - (relevance-20) * (4/60)   (doğrusal)

freshness = max(0, round(100 - ageHours * decay(relevance)))   // pencere dışında 0
```

## Fırsat puanı

```
risk >= 70                      -> 0
relevance === null              -> round(momentum * freshness_legacy / 100)   // eski yol
aksi halde                      -> clamp(0..100, round(momentum * freshness(relevance)/100 * relevanceFactor))
relevanceFactor = clamp(0.5..1.5, 0.5 + relevance/100)
```

İlgililik iki kez iş görür: düşüş hızını yavaşlatır (yaşlanan ilgili post hayatta
kalır) ve sonucu 0.5x–1.5x ölçekler (ilgisiz taze post havuzdan düşer).
`relevance === null` her iki katmanı da kapatır; mod kapalıyken çıktı eski kodla
bayt bayt aynıdır (`tests/scoring.test.ts`, "null relevance keeps
opportunityScoreRelevanceAware byte-identical").

Örnek (momentum 76, 19 saatlik post): eski puan 18 → havuz dışı.
relevance 100 ile decay 2 → freshness 62, puan `76*0.62*1.5 = 71` → havuzda.
Taze ama ilgisiz post (momentum 76, 12 dk, relevance 10): decay 6, freshness 99,
faktör 0.6 → 45 → havuz dışı.

## Havuz eşiği

`candidates()` / `opportunityCount()` / `marketDecisionFor()` sabit 70 yerine
`opportunityPoolThreshold()` okur:

```
min(app_settings.opportunity_pool_threshold (varsayılan 70, 0–100),
    etkin hesapların etkin kategori eşliklerindeki en düşük publish_threshold)
```

Havuz hiçbir zaman aşağı akıştaki en gevşek kapıdan daha sıkı değildir;
`publishCandidate()` hesap başına `publishThreshold` kontrolünü ayrıca uygular.

## Anlık görüntü

`bun scripts/fixture-snapshot.ts` 16 sentetik post üzerinde sürüm 3 çıktısı verir:
sürüm 1 alanları (eski yol), sürüm 2 alanları (yalnız `relevanceFactor`) ve sürüm 3
alanları (`freshnessDecayPerHour`, `freshnessRelevanceAware`,
`opportunityScoreRelevanceAware`) yan yana durur; eski anahtarların değeri değişmez.
