# Draft Performance Evaluator

## Amaç

Bu katman, SuperX Tweet Tester'daki temel fikri Ispatla'nın mevcut auto-hitmaker mimarisine uyarlar:

- taslağı mutlak "viral olur / olmaz" diye etiketlemez,
- yayın hesabının kendi public performans baseline'ına göre değerlendirir,
- yayın öncesi gözlenebilir ve semantik feature'lar çıkarır,
- tahmini göreli performansı `predictedResidual` olarak saklar,
- gerçek yayın snapshot'ları geldikçe tahmin ile outcome'u daha sonra kalibre edilebilir hale getirir.

Bu skor X'in iç ranking skoru değildir ve erişim garantisi vermez.

## Pipeline konumu

```text
Opportunity
  -> account selection
  -> draft generation
  -> deterministic quality gate
  -> Draft Performance Evaluator
       -> deterministic features
       -> optional semantic features
       -> account/category/format baseline
       -> shadow score + predicted residual
       -> draft_evaluations ledger
  -> PublicationIntent
  -> X
  -> public feedback snapshots
  -> future calibration
```

V1'de evaluator **shadow-only** çalışır. Değerlendirme hatası, mevcut yayın akışını bloke etmez.

## Veri modeli

Migration 15 ile `draft_evaluations` eklenir. Her draft için en fazla bir güncel evaluation tutulur.

Temel alanlar:

- `score`: 0-100 taslak değerlendirme skoru
- `confidence`: baseline maturity + semantic feature availability güveni
- `predicted_residual`: hesabın baseline'ına göre göreli tahmin; yeterli örnek yoksa NULL
- `baseline_scope`: `account_category_format`, `account_format`, `account`, `none`
- baseline medyan views/reply/repost/quote/engagement rate
- predicted views/reply/repost/quote
- deterministic feature JSON
- semantic feature JSON
- `helped` / `hurt` reason listeleri

## Baseline fallback sırası

```text
account × category × format
  -> account × format
  -> account
  -> none
```

Bir baseline'ın residual üretmesi için minimum 5 gerçek örnek gerekir.

V1, önce `publication_metric_snapshots` üzerinden güncel publication lifecycle verisini kullanır. Yeterli yeni nesil snapshot yoksa mevcut `feedback_snapshots` + confirmed attempt geçmişine düşer.

## Deterministic feature'lar

İlk sürüm:

- karakter ve kelime sayısı
- satır sayısı
- URL sayısı
- mention / hashtag sayısı
- sayı içeren token sayısı
- soru işareti
- tekrarlanan noktalama
- büyük harf oranı
- opening uzunluğu
- gerçekten yayınlanacak medya tipi

Kaynak postta medya bulunması, bizim draft'ın medya ile yayınlanacağı anlamına gelmediği için source media otomatik bonus değildir.

## Semantic feature'lar

AI yapılandırılmışsa ayrı structured evaluation çağrısı şu alanları üretir:

- hook strength
- specificity
- clarity
- novelty
- reply potential
- repost potential
- account fit
- bait risk
- helped
- hurt

Modelden doğrudan "viral score" istenmez. AI feature extractor'dır; final evaluator katmanı değildir.

Semantic evaluation başarısız olursa deterministic evaluation devam eder.

## V1 scoring

Deterministic score 50 tabanından başlar. Dengeli uzunluk, spesifik sayı ve gerçek medya gibi sinyaller küçük bonus; dış URL, aşırı hashtag/mention, repeated punctuation ve yüksek uppercase oranı küçük ceza üretir.

Semantic feature mevcutsa:

```text
semanticScore =
    0.18 hook
  + 0.15 specificity
  + 0.12 clarity
  + 0.10 novelty
  + 0.13 replyPotential
  + 0.16 repostPotential
  + 0.16 accountFit
  - 0.15 baitRisk
```

```text
draftScore =
  0.35 deterministic
+ 0.65 semantic
```

Bu formül learned model değildir. Shadow veri toplamak için başlangıç prior'ıdır.

Minimum 5 baseline örneğinde:

```text
predictedResidual ≈ 0.65 + score × 0.009
```

ve 0.55x - 1.60x aralığına clamp edilir.

Bu da geçici prior'dır. Yeterli observed outcome birikince heuristik mapping kaldırılmalıdır.

## Entegrasyon yüzeyleri

Evaluator şu akışlarda çalışır:

1. otomatik `publishCandidate()` akışı, quality gate sonrasında ve PublicationIntent öncesinde,
2. manuel/batch draft üretimi,
3. `POST /api/drafts`,
4. draft edit edildikten sonra `PATCH /api/drafts/:id`.

Draft Studio:

- evaluator score,
- confidence,
- baseline scope ve sample count,
- predicted residual,
- predicted views,
- helped/hurt nedenlerini gösterir.

## Öğrenme / V2

V1'in amacı dataset üretmektir. Her confirmed publication için sonradan şu kayıt eşleştirilmelidir:

```text
draft evaluation at publish time
  -> publication
  -> 60m / 6h / 24h snapshot
  -> actual residual
  -> prediction error
```

Yeterli veri sonrası hedefler:

- `predictedResidual` için isotonic / Platt benzeri calibration veya tabular regression,
- account × category segment calibration,
- reply/repost/view için ayrı prediction head'leri,
- score yerine expected residual'ın ana selection feature olması,
- aynı opportunity için birden fazla draft üreterek offline candidate selection,
- yalnız shadow sonuçlarla doğrulandıktan sonra opt-in publish threshold.

## Hard-gate'e geçiş şartı

Evaluator V1'de yayın engellemez.

Hard-gate ancak aşağıdakiler birlikte sağlanırsa düşünülebilir:

- yeterli sample ve zaman aralığı,
- time-split holdout evaluation,
- calibration error ölçümü,
- false-negative / missed-hit analizi,
- kategori bazlı precision/recall,
- model/provider değişiminde yeniden calibration.

Bu şartlar sağlanmadan `draftScore < X => block` kuralı eklenmemelidir.
