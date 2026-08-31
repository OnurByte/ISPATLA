# Ispatla Mevcut Kodunun XPatla Yapısı ve X Algoritmasıyla Derin Karşılaştırması

**Araştırma tarihi:** 29 Ağustos 2026
**Kapsam:** `/home/yargc/Documents/makavelli/Ispatla` mevcut çalışma ağacı, canlı yerel server, `plan.md`, yerel XPatla araştırması, resmi xAI algoritma kaynakları ve güncel kamu XPatla sayfaları
**Ana soru:** Mevcut kod çalışabilir mi, gerçekten iş yapıyor mu, XPatla’nın mantığını ve X algoritması hedefini ne kadar karşılıyor?
**Kanıt ilkesi:** Kodun varlığı, testin geçmesi, server’ın cevap vermesi, entegrasyonun hazır olması ve harici X postunun gerçekten doğrulanması ayrı iddialardır.

## Yönetici özeti

Mevcut Ispatla kodu çalışabilir bir yerel Next.js kontrol paneli ve veri işleyen bir X içerik pipeline’ıdır. Canlı server mevcut SQLite verisinden binlerce post ve yüzlerce fırsat döndürüyor; bu nedenle “hiçbir şey yapmıyor” demek yanlış olur. Sistem, yapılandırılmış FxTwitter kaynaklarını okuyup postları saklayabiliyor, basit momentum/engagement skorları çıkarabiliyor, opsiyonel AI değerlendirmesi yapabiliyor, Türkçe draft üretebiliyor, kalite/rights kapılarından geçirebiliyor ve original post için x-use queue kontratına bağlanabiliyor.

Fakat mevcut sistemin gerçek ürünü şu anda **XPatla’nın tam otonom hit/growth motoru değil, X sinyalleriyle çalışan editoryal fırsat ve kontrollü yayın kontrol panelidir**. XPatla’nın kamuya açık historik ürün iddialarıyla karşılaştırıldığında style cloning, Market candidate retrieval, tam XAgent, OAuth, schedule, quote/reply/thread/DM yürütme ve uzun dönem feedback öğrenmesi eksik veya yalnızca kısmi iskelet düzeyindedir.

X’in resmi açık kaynak algoritmasıyla karşılaştırıldığında da Ispatla, For You sıralamasını uygulamıyor. Ispatla configured source timeline’larından alınan postları rank ediyor; X’in Thunder/Phoenix/SimClusters retrieval katmanlarını, viewer-specific multi-action prediction modelini, VMRanker’ı, visibility filter zincirini veya production kalibrasyonunu içermiyor.

### Nihai karar

| Soru | Karar | Kanıt sınırı |
|---|---|---|
| Yerel uygulama ayağa kalkıyor mu? | **Evet** | Mevcut `next-server` çalışıyor; temel sayfalar ve GET API’leri 200 döndü. |
| Veri okuyup fırsat üretiyor mu? | **Evet, sınırlı biçimde** | Canlı DB’de 11.566 post ve 370 fırsat görüldü. |
| Türkçe draft ve editoryal kalite kapısı var mı? | **Evet** | `pipeline.ts`, `ai.ts`, `manual-drafts.ts` ve testler mevcut. |
| AI entegrasyonu hazır mı? | **Kısmen** | Codex runtime authenticated; canlı scan/model round-trip yeniden kanıtlanmadı. |
| X’e otomatik yayın şu anda hazır mı? | **Hayır** | `x-use doctor` gerekli config/account dosyaları olmadan başarısız. Ayrıca confirmation sınırında kod/README uyumsuzluğu var. |
| Güvenilir publication reconciliation var mı? | **Kısmen ve riskli** | FxTwitter reconciliation yolu mevcut; bazı publisher yolları remote URL’yi bağımsız doğrulamadan confirmed’a yaklaştırıyor. |
| XPatla ürün paritesi var mı? | **Hayır** | Temel fikirlerin bir bölümü var; style cloning, XAgent, format execution, OAuth ve Market parity yok. |
| X For You algoritması uygulanıyor mu? | **Hayır** | Mevcut sistem editorial heuristic ranker. |
| Hit/growth sonucu kanıtlanmış mı? | **Hayır** | Attribution, calibrated prediction, propensity correction ve uzun dönem kontrollü deney yok. |

### Uygulama sonrası durum

İlk audit snapshot’ından sonra planın güvenli ve yerel olarak doğrulanabilir dilimleri uygulandı:

- Publisher sonucu artık remote URL var diye `confirmed` sayılmıyor; tüm transport’lar reconciliation bekliyor.
- FxTwitter exact text + exact author doğrulaması sonrası bağlı publication ve automation job `confirmed` oluyor.
- Next 16 production build yolu TypeScript CLI fallback’i ile düzeltildi; `next build --webpack` başarıyla tamamlandı.
- Next 16 `src/proxy.ts` ile production’da panel sayfaları ve API yüzeyi Bearer boundary’si arkasına alındı; token browser’a taşınmıyor.
- Account category UI canonical catalog multi-select’e çevrildi ve DB/API bilinmeyen category slug’larını reddediyor.
- Dış `scan-once` worker’ı zamanı gelmiş queued automation job’larını tüketebiliyor; gelecekteki job’lara dokunmuyor.
- Otomatik opportunity kayıtları category eşleşmeyen account’lara yazılmıyor.

Bu değişiklikler local correctness ve deployment hazırlığını iyileştirir; x-use config/session eksikliği, gerçek X post round-trip’i, source cursor continuity ve uzun dönem growth kanıtı hâlâ açık kapılardır.

## 1. Araştırma yöntemi ve kanıt sınıfları

Bu raporda dört kanıt sınıfı kullanıldı:

1. **Doğrudan kod kanıtı:** Fonksiyon, route, schema, test veya çağrı zinciri mevcut.
2. **Yerel runtime kanıtı:** Server, endpoint veya mevcut SQLite state gerçek cevap verdi.
3. **Harici entegrasyon kanıtı:** x-use, FxTwitter, X API veya AI provider ile gerçek round-trip.
4. **Harici ürün/algoritma kanıtı:** Resmi veya birincil kamu kaynakları.

Bir özellik yalnızca ilk sınıfta mevcutsa “implemented” değil, kapsamına göre “partial” veya “unproven” olarak işaretlendi. Pazarlama iddiası, ürünün kapalı algoritması veya yerel araştırma çıkarımı, kaynak kodu veya resmi teknik doküman gibi sunulmadı.

İncelenen ana yerel kaynaklar:

- [`README.md`](/home/yargc/Documents/makavelli/Ispatla/README.md)
- [`plan.md`](/home/yargc/Documents/makavelli/Ispatla/plan.md)
- [`docs/RESEARCH-MAP.md`](/home/yargc/Documents/makavelli/Ispatla/docs/RESEARCH-MAP.md)
- [`xpatla-site-algoritma-arastirmasi-2026-08-21.md`](/home/yargc/Documents/makavelli/Ispatla/xpatla-site-algoritma-arastirmasi-2026-08-21.md)
- [`x-algorithm-news-account-analysis.md`](/home/yargc/Documents/makavelli/Ispatla/x-algorithm-news-account-analysis.md)
- [`src/server/pipeline.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/pipeline.ts)
- [`src/server/scoring.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/scoring.ts)
- [`src/server/db.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/db.ts)
- [`src/server/xuse.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/xuse.ts)
- [`src/server/publisher.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/publisher.ts)
- [`src/server/queue-service.ts`](/home/yargc/Documents/makavelli/Ispatla/src/server/queue-service.ts)

## 2. Mevcut çalışma ağacı ve doğrulama durumu

### 2.1 Git durumu

Çalışma ağacı temiz değil. Çok sayıda source, route, component, test, migration ve generated data değişikliği mevcut. Bu rapor hazırlanırken kullanıcı değişiklikleri korunmuş, reset/checkout/cleanup uygulanmamış ve yalnızca yeni rapor dosyası eklenmiştir.

`git diff --check` hata vermedi. Bu yalnız whitespace/diff biçiminin temiz olduğunu gösterir; ürün davranışının doğru olduğunu göstermez.

### 2.2 Static kapılar

| Kapı | Sonuç | Yorum |
|---|---|---|
| `bun test` | **77 geçti / 0 hata** | Persistence, scoring, security, publisher, x-reader, ideologies ve x-use sınırları için iyi yerel sinyal. |
| `bun run typecheck` | **Geçti** | TypeScript derleme tipi açısından hata bulunmadı. |
| `bun run lint` | **Geçti, 1 warning** | `src/components/market-page.tsx` içinde raw `<img>` yerine Next `Image` öneriliyor. |
| `next build` ilk audit denemesi | **Başarısız** | Turbopack Rust rayon thread pool `EAGAIN/SIGABRT` ile çöktü. |
| `next build --webpack` ilk audit denemesi | **Başarısız** | Next, TypeScript `--showConfig` çıktısını parse edemedi. |
| `next build --webpack` sonrası | **Geçti** | Next 16 dokümantasyonundaki `experimental.useTypeScriptCli: false` fallback’i ile compile, TypeScript, static generation ve route optimization tamamlandı. |

Bu yüzden “testler yeşil, production hazır” sonucu yine çıkarılamaz; ancak build kapısı artık geçmektedir. X-use, auth deployment, gerçek X write/reconciliation ve uzun dönem scheduler kanıtı build’den bağımsız açık kapılardır.

### 2.3 Canlı yerel server

Kullanıcıya ait mevcut `next-server (v16.3.2)` sürecine dokunulmadı. Read-only GET kontrolünde:

- `/` → `200`
- MCP tool list → ISPATLA-owned stdio surface
- `/queue` → `200`
- `/api/status` → `200`
- `/api/capabilities` → `200`
- `/api/analytics` → `200`
- `/api/market` → `200`
- `/api/sources` → `200`
- `/api/accounts` → `200`
- `/api/drafts` → `200`
- `/market` → `/opportunities` redirect’i

`/api/status` canlı state’ten şu değerleri verdi:

```text
sourcesConfigured: 919
sourcesObserved: 154
postsObserved: 11566
postsLast24h: 5990
opportunities: 370
attemptsPending: 0
publishedConfirmed: 0
publishBlocked: 62
```

Bu değerler intake ve dashboard tarafının gerçek veriyle çalıştığını gösterir. Aynı cevapta `publishedConfirmed: 0` olması, sistemin canlı ve veri dolu olmasının gerçek X yayını yapıldığı anlamına gelmediğini açıkça gösteriyor.

### 2.4 Runtime capability durumu

`/api/capabilities` çıktısında:

- `x-use` binary bulundu ve `mcp`/post capability’si keşfedildi.
- `doctor` **failed**.
- Eksik dosyalar: `config/settings.json`, `config/accounts.json`.
- Chrome ve chromedriver mevcut.
- x-use tarafında hesap tanımlı değil.
- Vault hazır değil; `ISPATLA_SECRET_KEY` yok.
- Codex binary mevcut ve authenticated görünüyor.

Bu, `x-use` transport’un kurulu olduğunu ama yayın hesabı/session/config tarafının hazır olmadığını gösterir. `xuseCapability()` transport’u doctor sonucundan ayırıyor; bu dashboard’da “CLI hazır” gibi daha olumlu bir görüntü üretebilir. Gerçek `runXUseJob()` ise doctor’ın başarılı olmasını zorunlu tutuyor. Bu iki kapı bilinçli ayrılmış olsa da kullanıcı açısından “available” ile “publish-ready” ayrımı daha açık olmalıdır.

## 3. Mevcut Ispatla ne yapıyor?

### 3.1 Intake ve source discovery

`pipeline.ts` FxTwitter kaynaklarından post listeleri alıyor, post kimliği/text zorunluluğunu kontrol ediyor, ham JSON’u saklıyor ve kaynak/provenance ilişkisini SQLite’a yazıyor.

Source discovery tarafında:

- quote author kanıtı ağırlığı `3`;
- reply target kanıtı `2`;
- mention kanıtı `1`;
- adaylar için kanıt eşiği ve AI source score var;
- düşük kaynaklar için tekrar değerlendirme ve deletion cooldown var;
- pinned kaynaklar korunuyor;
- kaynak kimliği ve avatar bilgisi doğrulanmaya çalışılıyor.

Bu, basit bir “handle listesi”nden daha iyi bir provenance temeli oluşturuyor. Ancak source discovery, X’in tüm ağını tarayan global candidate retrieval değildir. Configured source timeline’larından ve gözlenen quote/reply/mention ilişkilerinden türetilen yerel bir graph’tır.

### 3.2 Post normalization ve metrikler

`normalisePost()` şu alanları alıyor:

- external ID, source/author handle;
- text ve status URL;
- likes, replies, reposts, quotes, views;
- follower sayısı;
- blue-check/verification durumu;
- media ve sensitive flag;
- raw JSON;
- lexical `clusterKey`;
- deterministik momentum skoru.

Olumlu taraf: `db.ts` içindeki metric snapshot tabloları nullable metric ve `partial/ok` kalite durumunu saklıyor. Bu, ham veride eksik view veya engagement alanını teorik olarak ayırt edebiliyor.

Kritik sorun: `normalisePost()` ana post modelinde eksik numeric alanları `0` yapıyor. Snapshot düzeyinde “unknown” korunurken scoring’e giden ana değer sıfır olabiliyor. Bu iki katman aynı semantiği kullanmadığında sistem:

- “görüntülenme bilinmiyor” ile
- “görüntülenme gerçekten sıfır”

durumlarını karıştırabilir. Bu, özellikle yeni/az desteklenen source’larda yanlış düşük score ve yanlış baseline üretir.

### 3.3 Mevcut scoring

`scoring.ts` iki ana seviyede çalışıyor:

1. Observed engagement toplamı.
2. Yaş tabanlı velocity ve follower-normalized engagement rate.
3. Momentumun risk ve tazelikle fırsat skoruna dönüşmesi.

Mevcut heuristic kabaca şunları kullanıyor:

- log velocity;
- log views;
- engagement rate;
- follower normalize oranı;
- media bonusu;
- sensitive/risk cezası.

Post seviyesinde AI score yoktur: `scorePost()` engagement, velocity, follower-normalized rate, media ve sensitive riskinden deterministik momentum üretir. Market ve otomatik aday kapısı bunu `opportunityScore()` ile güncel tazelik yüzdesiyle çarpar; bu nedenle 16 saat 15 dakikalık 100 momentum 35 fırsat puanına iner. Otomatik yayın için ayrıca kaynakta açık ve etkin bir kategori eşleşmesi gerekir. Kaynak AI değerlendirmesi ayrı bir source-discovery işlevidir; post sıralaması veya yayın kapısı değildir. Bu, editorial triage için makul bir ilk katman. Ancak aşağıdaki nedenlerle hit olasılığı modeli değildir:

- yalnız sabit, lineer post yaşı çarpanı vardır; source/category/topic bazlı outcome kalibrasyonu yoktur;
- viewer-specific preference yok;
- selection bias düzeltmesi yok;
- published ve unpublished post exposure farkı modellenmiyor;
- account opportunity ile global post score ayrılmıyor;
- score çıktısının gerçek outcome karşısında residual kalibrasyonu yok.

`isNumericalHit()` gibi eşikler, “momentum >= 90, risk < 35, age <= 2h” türü deterministik operasyon filtresidir. X’in iç hit veya reach sınıflandırması değildir.

### 3.4 Clustering

`clusterKey()` küçük harf, punctuation/URL temizleme ve ilk anlamlı kelimelerin alınmasına dayalı deterministic lexical key üretiyor. Bu sayede aynı/benzer kısa haberler bir araya getirilebiliyor.

Fakat bu, aşağıdaki olayları güvenilir ayıramaz:

- aynı kelimeleri kullanan farklı olaylar;
- aynı olayın farklı dil/ifade biçimleri;
- meme/remix ile gerçek event;
- conversation cluster ile news cluster;
- topic ile format sinyalinin ayrımı;
- merge/split kararının audit edilebilir semantiği.

Schema’da `opportunity_clusters`, `cluster_observations`, category ilişkileri ve audit tabloları bulunuyor; fakat clustering davranışı hâlâ esas olarak lexical ve son gelen sınıflandırmanın global `kind` alanını etkilediği bir seviyede.

### 3.5 AI kullanımı

Provider katmanı `api`, `compatible` ve `codex` ayrımını destekliyor. OpenAI-compatible model ID’leri kapalı bir whitelist’e zorlanmıyor. AI enable/disable ve `usage_events` ledger yaklaşımı doğru yönde.

AI çağrılarında mevcut güçlü noktalar:

- AI kapalıysa yeni model çağrısı fail-closed.
- Manual hazır text’in AI kapalıyken korunması amaçlanıyor.
- Prompt injection’a karşı kaynak text’i veri olarak ele alma talimatı var.
- Usage provider/model/kind bazında ledger’a yazılıyor.
- Codex application secret’larını child process’e taşımamak için environment allowlist var.

Eksikler:

- `resolveAccountAiRoute()` altyapısı var, fakat analysis/review çağrıları pratikte çoğunlukla global route kullanıyor; account×category route writing kadar etkili değil.
- Model×task×category calibration yok.
- Style cloning için geçmiş postlardan çıkarılmış örnekleme/embedding/profile extraction yok; stil hâlâ büyük ölçüde elle yazılmış JSON alanlarıdır.
- Kaynak AI değerlendirmesinin gerçek publish outcome’larıyla kalibrasyonu yok.
- Source/category/account uygunluğu öğrenilmiş bir opportunity modeline dönüşmüyor.

### 3.6 Draft ve kalite

Draft üretim zinciri:

`account style profile + source context + category context + related posts → AI draft → attribution → quality gate`

Mevcut kalite kapıları:

- 280 karakter sınırı;
- boş/kısa metin kontrolü;
- exact source copy engeli;
- sensitive içerik engeli;
- kaynak attribution biçimi;
- rights-cleared media indirme sınırı;
- prompt injection talimatı.

Bu, Türkçe original post draft üretmek için çalışır bir minimum yol sunuyor. Ancak XPatla’nın çok-formatlı ürün iddiasına göre eksik kalıyor:

- quote/reply/thread/DM formatlarının hepsi metadata’da var gibi görünse de üretim ve kalite mantığı çoğunlukla 280 karakterli tek text gibi davranıyor;
- thread için gerçek segment/ordering/retry modeli yok;
- reply/quote için güvenilir target execution yok;
- DM için yalnız draft/preview sınırı var;
- AI coach veya interaktif kalite önerisi XPatla parity’si düzeyinde yok.

## 4. XPatla ile karşılaştırma

### 4.1 XPatla hakkında güvenilir ayrım

XPatla karşılaştırmasında ürün pazarlaması ile güncel kamu durumu ayrılmalıdır. [Platform Integrity](https://xpatla.com/platform-integrity) sayfası 10 Temmuz 2026 güncellemesinde Circle, Growth Credit ve engagement marketplace tarafında durdurmalar; AI replies için approval gereği; scheduled original post için açık consent, cadence, cap ve stop controls gibi sınırlar anlatıyor. Bu, historik “full auto-growth” dilinin bugünkü kamu davranışıyla aynı kabul edilemeyeceğini gösterir.

[XPatla pricing](https://xpatla.com/pricing?highlight=lite), [XAgent sayfası](https://xpatla.com/xagent), [destek açıklamaları](https://api.xpatla.com/support?tab=track) ve [Fast AI Labs ürün sunumu](https://www.fastailabs.com/) ise style cloning, Market, XAgent, tweet/thread/quote/reply üretimi, AI coach, multi-account ve credit tabanlı ürün iddiaları sunuyor. Bunlar ürün kapsamı için kamu kanıtıdır; kapalı scoring formülü, prompt, embedding, training veya gerçek X ranking erişimi için kaynak kanıtı değildir.

### 4.2 Özellik matrisi

| XPatla/ürün yeteneği | Ispatla durumu | Değerlendirme |
|---|---|---|
| X account bağlantısı | **Kısmi** | x-use account ID ve resmi token env desteği var; OAuth onboarding yok. |
| Hesap yazı stilini öğrenme | **Kısmi** | Manuel `styleProfile` JSON var; gerçek geçmiş yazılardan style cloning yok. |
| Niş/source keşfi | **Kısmi** | FxTwitter source ve quote/reply/mention discovery var; global Market retrieval yok. |
| Market fırsat sıralaması | **Kısmi** | Deterministik momentum ve tazelik skoru var; XPatla Market skoru doğrulanmış değil. |
| Tweet generation | **Var** | Türkçe original draft üretim yolu mevcut. |
| Thread generation | **Draft/kısmi** | Format alanı var; güvenilir çoklu post yürütme yok. |
| Quote/reply generation | **Draft/kısmi** | Draft üretilebilir; x-use execution yolu bilinçli olarak post-only. |
| DM generation | **Draft** | Otomatik DM gönderimi yok; bu güvenlik açısından doğru sınır. |
| AI coach | **Yok/kısmi** | MCP üzerinden kontrollü intent/queue tool’ları; XPatla coach parity’si değil. |
| Multi-account | **Kısmi** | Account tablosu, limit ve seçim var; aynı cluster için account-specific modelleme zayıf. |
| Scheduled publishing | **Kısmi** | `scheduledAt` saklanıyor; scheduled job tüketen worker kanıtlanmadı. |
| Original post publishing | **Kısmi/unproven** | x-use MCP queue adapter var; doctor/config ve gerçek post round-trip yok. |
| OAuth publish | **Yok** | Resmi publisher env bearer token kullanıyor; OAuth flow yok. |
| Credit/economy | **Yok** | Usage ledger AI maliyetini izliyor; XPatla credit ekonomisi uygulanmış değil. |
| Quality/rights gate | **Var, dar kapsamlı** | Text/sensitive/media rights kontrolleri mevcut. |
| Publication reconciliation | **Kısmi/riskli** | FxTwitter exact text/author yolu var; her publish path’inde confirmation aynı güvenilirlikte değil. |
| Feedback learning | **Kısmi** | Milestone snapshot ve account feedback score var; learned residual/causal attribution yok. |
| Auto-growth guarantee | **Yok** | Teknik olarak da bilimsel olarak da garanti kanıtı yok. |

### 4.3 En önemli fark: XPatla “contextual content engine”, Ispatla “source-driven editorial engine”

Kamu kanıtlarından çıkarılabilecek en güvenli XPatla modeli şudur:

`stil bağlamı → niş/source fırsatı → format/task seçimi → AI draft → style/quality review → kullanıcı veya kontrollü otomasyon`

Ispatla’nın mevcut modeli ise:

`configured source timeline → raw post → deterministic score → lexical cluster → açık kaynak kategorisi → account filter → draft → quality gate → original post queue`

İki modelin kesişimi draft ve fırsat katmanıdır. Ayrışma; retrieval derinliği, style learning, format execution, account opportunity scoring, publication confirmation ve feedback kalibrasyonunda oluşur.

## 5. X’in resmi algoritmasıyla karşılaştırma

Karşılaştırma için [xAI’nin resmi `x-algorithm` repository’si](https://github.com/xai-org/x-algorithm) ve [Phoenix açıklaması](https://github.com/xai-org/x-algorithm/blob/main/phoenix/README.md) esas alındı.

### 5.1 Resmi algoritma modeli

Resmi repository’nin kamuya açıkladığı çerçevede For You akışı kabaca:

1. In-network candidate’lar için Thunder.
2. Out-of-network candidate’lar için Phoenix/SimClusters.
3. Candidate retrieval ve hydration.
4. Prefilter ve güvenlik/uygunluk filtreleri.
5. Phoenix multi-action transformer ile kullanıcı aksiyon olasılıkları.
6. Weighted ranking, author diversity, OON/new-author etkileri ve VMRanker.
7. Visibility filtering ve son sıralama.

Bu, yalnız “post engagement yüksekse üste çıkar” modelinden çok farklıdır. Viewer, author, network, içerik, zaman, aksiyon olasılıkları ve görünürlük kısıtları birlikte değerlendirilir.

### 5.2 Ispatla eşlemesi

| X algoritması katmanı | Ispatla karşılığı | Durum |
|---|---|---|
| Candidate retrieval | Configured FxTwitter source feed | **Daraltılmış karşılık** |
| Out-of-network discovery | Quote/reply/mention source discovery | **Kısmi** |
| SimClusters | Lexical `clusterKey` | **Aynı şey değil** |
| Candidate hydration | Raw post/profile/media alanları | **Kısmi** |
| Prefilter | Sensitive/risk/age/score gates | **Kısmi** |
| Multi-action probabilities | Likes/replies/reposts/quotes toplamı | **Yok** |
| Viewer personalization | Account style/category fit | **Çok sınırlı proxy** |
| Phoenix transformer | Yok | **Eksik** |
| VMRanker | Yok | **Eksik** |
| Author diversity | `selectDiverseCandidates` source/cluster başına seçim | **Basit editorial çeşitlilik** |
| New-author boost | Yok | **Eksik** |
| Visibility filtering | Sensitive/risk gate | **Aynı kapsam değil** |
| Production calibration | Feedback snapshots | **Kısmi, kalibre değil** |

### 5.3 Sonuç

Ispatla’nın `scorePost()` fonksiyonu X’in ranking implementation’ı değildir. Deterministik momentum ve tazelik skoru da X’in internal score’una dönüşmez. Bu iyi bir ürün sınırıdır; README ve `docs/RESEARCH-MAP.md` bunu “Ispatla estimate” olarak tutmalıdır.

Ispatla’nın doğru iddiası:

> X üzerindeki gözlenen source ve engagement sinyallerinden, belirli bir yayın hesabı için editoryal fırsat tahmini üretir.

Yanlış iddia:

> X’in For You algoritmasını kopyalar, X internal ranking score’unu bilir veya viral sonucu garanti eder.

## 6. `plan.md` hedefiyle uyum analizi

### Phase -1: Persistence ve publication foundation

**Mevcut:** Native SQLite, WAL, foreign keys, busy timeout, versioned migrations, post/cluster/publication/feedback tabloları, x-use env allowlist, basic reconciliation yapısı.

**Eksik/riskli:**

- Reader cursor kaydında gerçek incremental cursor kullanımı ve gap recovery zayıf.
- Kaynak fetch akışı çoğunlukla ilk sayfa/maxPosts sınırında kalıyor.
- Bazı safety query’leri `criticalRows()` kullanırken genel `rows()` DB hatasını boş listeye çeviriyor.
- Publication confirmation her transport’ta aynı bağımsız doğrulama standardına sahip değil.
- Aynı source/cluster’ın iki account için bağımsız opportunity olması schema’da mümkün olsa da pipeline bütün otomatik account’lara aynı score/confidence yazabiliyor.

**Karar:** Persistence foundation kısmen uygulanmış; production publication foundation tamamlanmış değil.

### Phase 0: Category/custom/AI routing

**Mevcut:** Built-in ve custom category schema/API, source/category ve account/category tabloları, category policy ve AI route alanları, canonical ideology catalog.

**Eksik/riskli:**

- Account UI hâlâ `styleProfile.categories` içine virgülle serbest text kabul ediyor.
- Source UI’de first-class source/category mapping kontrolü görünür değil; API mevcut olsa da kullanıcı akışı kopuk.
- Built-in category seed’leri ve gerçek category-specific strategy davranışı sınırlı.
- Category policy JSON olarak saklanıyor; score/publish davranışına tam bağlanmıyor.

**Karar:** Schema/API seviyesi güçlü, ürün davranışı ve UI entegrasyonu partial.

### Phase 1: Time series ve acceleration

**Mevcut:** 2, 5, 10, 20 ve 60 dakikaya yakın snapshot mantığı; post/cluster metric snapshot tabloları; nullable metric quality.

**Eksik/riskli:**

- `plan.md` içindeki 6 saat/24 saat milestone kapsamı source post refresh’inde yok.
- Acceleration alanı bulunmasına rağmen pipeline’da tam karar mekanizmasına bağlanmış değil.
- Baseline source×category×topic×age seviyesinde değil; çoğunlukla category ve sabit yaş penceresi/ortalama yaklaşımı.
- Yaşlanan postlar tazelik eşiğinin altında otomatik aday havuzundan çıkar.

**Karar:** Snapshot altyapısı var, gerçek breakout/acceleration modeli yok.

### Phase 2: OpportunityCluster

**Mevcut:** Cluster tabloları, observations, categories, metric snapshots, merge/audit temel yapısı.

**Eksik/riskli:**

- Lexical first-eight-word cluster gerçek event/meme/conversation/remix ayrımı için zayıf.
- Son sınıflandırmanın global cluster kind’ını etkileyebilmesi farklı observation’ların semantiğini bozabilir.
- Category-specific cluster strategy gerçek davranışa tam ayrışmış değil.

**Karar:** Persistence var, semantik opportunity cluster motoru partial.

### Phase 3–6: Strategy, source graph, competitor gap, multi-score/EIR

**Mevcut:** Category alanları, source discovery, competitor kayıtları, account opportunity tablosu, score/confidence/EIR alanları.

**Eksik:**

- Strategy seçimi gerçek category-native scoring/publishing politikalarına dönüşmemiş.
- Kalıcı edge ledger ve kategoriye göre source reputation sınırlı.
- `category_competitors` schema’sı var, fakat competitor gap hesaplama yolu yok denecek kadar az.
- EIR bağımsız bir incremental reach modeli değil; score’a yakın kopyalanıyor.
- Emergence, Virality, Account Opportunity ve Publish Confidence ayrımları tam uygulanmış değil.

**Karar:** Alan isimleri ve schema hedefi koddan ileride; bunlar “done” sayılamaz.

### Phase 7–12: Shadow, failure observatory, learned model, kill switch, portfolio, publisher

Bu fazların çoğu plan düzeyinde kalıyor:

- selection propensity log’ları yok;
- shadow/challenger karşılaştırması yok;
- false positive/missed hit/wrong account/wrong category/format/cannibalization outcome modeli yok;
- learned residual veya model drift gözlemi yok;
- global pause var, account/category/model/reader path düzeyi tam kill switch yok;
- dynamic portfolio allocation yok;
- publisher original post ile sınırlı ve canlı doğrulanmamış.

## 7. Kritik teknik bulgular

### 7.1 En yüksek öncelik: publication confirmation erken olabilir

README açıkça receipt’in publication proof olmadığını ve exact text/author/media reconciliation gerektiğini söylüyor. İlk audit snapshot’ında `publishCandidate()` publisher `remoteUrl` döndürdüğünde attempt’i confirmed’a yaklaştırıyordu. Bu dilimde düzeltildi: publisher response ID’si ve remote URL artık yalnız reconciliation locator’ı olarak saklanıyor; resmi X response’u postun gerçekten seçilen hesap tarafından görünür olduğunu tek başına ispatlamıyor.

Benzer biçimde x-use adapter `search_profile` üzerinden aynı text’i bulursa remote URL üretebiliyor; text eşleşmesi author identity’nin bağımsız FxTwitter doğrulamasıyla aynı şey değildir. Güvenli standart şu olmalı:

```text
transport receipt
  != remote URL
  != exact text match
  != exact text + exact author + remote metrics
  = confirmed publication
```

Mevcut durum bu zinciri bazı yollar için uyguluyor, bazı yollar için erken kırıyor. Bu nedenle `publishedConfirmed` sayısının gerçek X publication kanıtı olarak kullanılabilmesi ayrıca doğrulanmalıdır.

### 7.2 x-use kurulumu gerçek çalıştırmayı bloke ediyor

`x-use` komutu mevcut olmasına rağmen repo çalışma dizininde:

- `config/settings.json` yok;
- `config/accounts.json` yok;
- cookie/account session yok;
- doctor exit code 1.

Ispatla’daki `xuseAccountId` yalnız mapping alanıdır; x-use’un gerçek account/session dosyalarını üretmez. Bu iki config boundary’si provisioning adımında açıkça bağlanmadıkça queue post çalışmayacaktır.

### 7.3 Account×category fırsatı gerçekte account-specific değil

Pipeline post scoring sırasında otomatik hesapların tümüne aynı cluster score/confidence ile account opportunities yazıyor. Sonraki account selection katmanında feedback, source compatibility ve category filter kullanılsa da ilk opportunity value hesap özelinde üretilmiyor.

Bu nedenle iki hesap için:

- farklı style fit;
- farklı category route;
- farklı source policy;
- farklı competitor gap;
- farklı cooldown/budget;
- farklı historical residual

olması gereken yerde aynı global opportunity score taşınabiliyor.

### 7.4 Category first-class schema, legacy UI ile çelişiyor

`account_categories` ve `source_categories` tabloları ile API route’ları var. Buna rağmen account UI `styleProfile.categories` alanını virgülle dolduruyor. Bu:

- canonical category slug zorlamasını zayıflatır;
- olmayan category değerlerini sistemde tutabilir;
- first-class config ile legacy tag’in hangisinin öncelikli olduğunu belirsizleştirir;
- `plan.md` içindeki “free-text reject” hedefiyle çelişir.

Bu, yalnız bir UI eksikliği değil, routing doğruluğu ve ürün sözleşmesi problemidir.

### 7.5 Scheduler tamamlanmış görünmesine rağmen worker kapısı açık

README harici systemd timer/worker yaklaşımını anlatıyor. `src/instrumentation.ts` Next içi scheduler’ı no-op bırakıyor. Queue’da `scheduledAt` saklanıyor ve artık dış `scripts/scan-once.ts` worker’ı zamanı gelmiş queued job’ları `runDueAutomationJobs()` üzerinden tüketebiliyor. Gerçek x-use config/session yokken bu worker güvenli biçimde başarısız/pending sonucu üretir; scheduled zamanda başarılı X postu yine harici round-trip kanıtı ister.

Sonuç: “scheduledAt kaydedildi” ile “post scheduled zamanda yayınlandı” ayrı tutulmalı.

### 7.6 Metrics continuity ve missingness yeterince güvenli değil

Snapshot tabloları doğru yönde olsa da:

- ana post modelindeki missing numeric alanlar zero’ya çevriliyor;
- source cursor boş tutuluyor;
- gap detection gerçek pagination continuity yerine zayıf bir maxPosts karşılaştırmasına dayanıyor;
- baseline topic/age/source/category olarak yeterince ayrışmıyor;
- feedback snapshot’ları bazı yerlerde bilinmeyeni zero gibi gösteriyor.

Bu sorunlar score’un yanlış görünmesine, eski postların tekrar aday olmasına veya “data yok” durumunun “performans düşük” olarak yorumlanmasına yol açabilir.

### 7.7 Auth mutation için var; hassas GET yüzeyi ayrı sınır istiyor

`guardMutation()` production’da `ISPATLA_ADMIN_TOKEN` yoksa 503, yanlış Bearer varsa 401 dönüyor. Mutation route’larının büyük bölümü guard kullanıyor. Bu iyi bir ortak güvenlik katmanı.

Ancak:

- browser client fetch’leri Authorization header göndermiyor;
- yalnız mutation guard olması `/api/accounts`, `/api/drafts`, `/api/usage`, key metadata ve analytics gibi hassas GET’leri korumuyor;
- gerçek production boundary VPN, authenticated reverse proxy veya session auth olmalı;
- proxy doğrulanmış isteğe server tarafında Bearer eklemeden UI mutation’ları çalışmayabilir.

Bu nedenle auth “route içinde guard var” seviyesinde partial; gerçek deployment auth modeli tamamlanmış değil.

## 8. Güçlü taraflar

Kodun işe yarayan ve korunması gereken tarafları şunlar:

1. **Ürün akışı nettir:** source → opportunity → draft → gate → queue → reconciliation → feedback.
2. **Receipt ile publication ayrımı bilinçli olarak tasarlanmıştır:** README, UI ve bazı kod yolları bunu açıkça anlatıyor.
3. **SQLite temeli ciddidir:** WAL, foreign keys, migration ve publication/metric tabloları var.
4. **AI provider tasarımı esnektir:** Codex korunuyor, OpenAI-compatible endpoint ve arbitrary model ID destekleniyor.
5. **AI kapatma ve usage ledger doğru yöndedir:** manual text continuity korunuyor, parallel counter yapılmıyor.
6. **Source discovery güvenlikli hale getirilmiştir:** provenance, evidence weighting, pinned protection ve deletion cooldown var.
7. **Quote/reply/DM otomasyonu bilinçli olarak sınırlanmıştır:** doğrulanmamış execution kontratını başarı saymamak doğru.
8. **Chat yüzeyi kaldırılmıştır:** agent erişimi ISPATLA-owned MCP tool’larına taşındı; publication mutation’ları açık onayda tutuluyor.
9. **Sensitive/media/right sınırları vardır:** media yalnız allowlist ve rights kontrollerinden sonra aktarılmaya çalışılıyor.
10. **Kod X internal score iddiasında bulunmamalıdır:** mevcut heuristic’in doğru pozisyonu editorial estimate’tir.

## 9. Zayıf taraflar ve sonuçları

| Zayıf taraf | Ürün sonucu | Öncelik |
|---|---|---:|
| x-use config/account provisioning yok | Otomatik yayın fiilen başlayamaz | P0 |
| Build iki yolda da başarısız | Production deploy güveni yok | P0 |
| Early confirmed publication | Yanlış başarı ve yanlış analytics | P0 |
| Browser/API auth boundary eksik | Production’da hassas veri/mutation riski | P0 |
| Missing metrics → zero | Yanlış score/baseline | P1 |
| Cursor/gap continuity zayıf | Post kaçırma ve duplicate/late scoring | P1 |
| Aynı score tüm account’lara | Yanlış hesap seçimi ve düşük hit fit | P1 |
| Legacy free-text category UI | Category routing drift | P1 |
| Schedule worker belirsiz | Scheduled job yalnız DB kaydı olur | P1 |
| Lexical cluster | Meme/event/conversation ayrımı zayıf | P1 |
| Competitor gap/EIR yok | Growth iddiası ölçülemez | P1 |
| Format execution post-only | XPatla parity yok | P2 |
| Style cloning yok | Hesap sesi elle tanımlanır | P2 |
| Learned/shadow/failure observatory yok | Sistem kendi hatasını öğrenemez | P2 |

## 10. Ponytail değerlendirmesi: neyi şimdi yapmamak gerekir?

Tam X algoritmasını yeniden yazmak bu kod tabanı için şu anda gereksiz ve yanlış hedef olur. Önce mevcut pipeline’ın tek bir güvenilir publish/feedback döngüsü kurması gerekir. Phoenix, SimClusters, VMRanker veya kapalı X ağırlıklarını taklit eden büyük bir model eklemek, gerçek X reader continuity’si ve publication reconciliation çözülmeden ölçülebilir değer üretmez.

En küçük anlamlı ürün hedefi şu olmalıdır:

```text
reliable source reader
→ missing-aware metrics
→ account/category-specific opportunity
→ human-approved original post
→ exact remote reconciliation
→ account-bound milestone feedback
```

Bu döngü kanıtlanmadan:

- yeni scoring abstraction’ları;
- learned model;
- global viral score;
- full XAgent;
- otomatik reply/DM;
- daha fazla format;
- X internal algorithm iddiası

eklemek ölçüm borcunu büyütür.

## 11. Önerilen uygulama sırası

### P0 — Çalışabilirlik ve doğruluk kapıları

1. Next build hatasının root cause’unu çöz ve Turbopack veya Webpack için tek resmi production build yolu seç.
2. x-use provisioning sözleşmesini açıklaştır: `XUSE_CWD`, settings, accounts, cookie/session ve Ispatla account mapping aynı test account ile doğrulansın.
3. Publisher’ın tüm yollarını `pending_reconciliation` ile başlat; yalnız FxTwitter exact text + exact author + remote ID doğrulamasından sonra `confirmed` yap.
4. Hassas GET ve browser mutation auth modelini reverse proxy/session sınırıyla tamamla.
5. Gerçek test account ile yalnızca açık yetki altında bir authorized post + FxTwitter reconciliation round-trip yap.

### P1 — Ölçüm ve seçim doğruluğu

1. Missing metrics semantiğini post, snapshot, baseline ve feedback katmanlarında tekleştir.
2. Reader cursor/high-watermark/pagination gap modelini gerçekten kullan.
3. `account_opportunities` değerini account×category×cluster bağlamında hesapla; tüm account’lara aynı score kopyalamayı bırak.
4. First-class category config’i UI’da kullan; legacy free-text category alanını kaldır veya yalnız canonical slug’a resolve et.
5. Scheduled queue worker’ı ya gerçek bir worker olarak kanıtla ya da scheduledAt’i yalnız “not scheduled” olarak göster.
6. Source×category×topic×age baseline ve 2m/5m/10m/20m/60m/6h/24h feedback serisini tamamla.

### P2 — Gerçek XPatla-benzeri farklılaştırma

1. Hesap geçmişinden kontrollü style profile extraction ve örnek seçimi.
2. Category-native event/topic/meme/conversation/format strategy’leri.
3. Competitor gap, lead time ve category competitor graph.
4. Shadow selector, propensity logging ve false-positive/missed-hit outcome ledger.
5. Kalibre edilmiş Emergence, Virality, Account Opportunity, Publish Confidence ve EIR ayrımı.
6. Gerçek execution kontratı ve policy onayı varsa quote/reply/thread kapsamını genişletme.

Bu sıralamada P0 tamamlanmadan P2 scoring yatırımına geçmek önerilmez.

## 12. Sonuç

Mevcut kod **çalışıyor ve iş yapıyor**, fakat yaptığı iş doğru adlandırılmalı: X kaynaklarından veri toplayan, fırsatları deterministik momentum/tazelikle önceliklendiren, Türkçe draft üreten ve kontrollü original-post yayın akışına hazırlanan bir editorial control plane.

Şu anda **XPatla’nın tam karşılığı değildir**. XPatla’nın kamuya açık historik ürün mantığındaki style cloning, Market retrieval, XAgent, OAuth/schedule ve çok-formatlı execution yetenekleri ya yoktur ya da partial durumdadır. Güncel XPatla kamu durumu da historik pazarlama iddialarından daha sınırlı ve approval/consent odaklıdır.

Şu anda **X algoritması değildir**. X’in resmi açık kaynak mimarisindeki candidate retrieval, Phoenix/Thunder, multi-action ranking, VMRanker, viewer personalization ve visibility filtering Ispatla’da yoktur. Ispatla’nın score’u internal X ranking score değil, yapılandırılmış kaynaklardan türetilmiş editorial opportunity estimate’tir.

En kritik gerçek şu: canlı server ve dolu DB, canlı X yayınını kanıtlamıyor. `publishedConfirmed: 0` ve x-use doctor failure birlikte değerlendirildiğinde sistemin doğru mevcut etiketi:

> **Local/runtime editorial pipeline: çalışır. Production build: çalışır. AI-assisted draft/opportunity: kısmen çalışır. Güvenilir otomatik X publisher: x-use config/session nedeniyle henüz hazır değil. XPatla/full hit-growth engine: uygulanmamış.**

## Kaynaklar

### Birincil teknik kaynaklar

1. [xAI — x-algorithm resmi repository](https://github.com/xai-org/x-algorithm)
2. [xAI — Phoenix retrieval/ranking README](https://github.com/xai-org/x-algorithm/blob/main/phoenix/README.md)
3. [XPatla — Platform Integrity](https://xpatla.com/platform-integrity)
4. [XPatla — XAgent](https://xpatla.com/xagent)
5. [XPatla — Pricing](https://xpatla.com/pricing?highlight=lite)
6. [XPatla — Product/support surface](https://api.xpatla.com/support?tab=track)
7. [Fast AI Labs — XPatla product/company claims](https://www.fastailabs.com/)

### Yerel kaynaklar

1. [`README.md`](/home/yargc/Documents/makavelli/Ispatla/README.md)
2. [`plan.md`](/home/yargc/Documents/makavelli/Ispatla/plan.md)
3. [`docs/RESEARCH-MAP.md`](/home/yargc/Documents/makavelli/Ispatla/docs/RESEARCH-MAP.md)
4. [`xpatla-site-algoritma-arastirmasi-2026-08-21.md`](/home/yargc/Documents/makavelli/Ispatla/xpatla-site-algoritma-arastirmasi-2026-08-21.md)
5. [`x-algorithm-news-account-analysis.md`](/home/yargc/Documents/makavelli/Ispatla/x-algorithm-news-account-analysis.md)

### Sınırlamalar

- XPatla’nın kapalı source code’u, private scoring formülü, prompt’ları, training verisi ve production deployment’ı incelenemedi.
- X’in gerçek ranking ağırlıkları ve production model parametreleri kamu repository’sinde tam olarak bulunmaz.
- Gerçek X postu, reply, quote, DM veya automated engagement bu audit sırasında çalıştırılmadı.
- x-use binary mevcut olsa da valid account/config/session ile gerçek publish round-trip’i yapılmadı.
- Mevcut local server’ın GET cevapları runtime kanıtıdır; production deployment, reverse proxy/TLS kurulumu ve uzun dönem scheduler davranışını kanıtlamaz. Proxy kod sınırı artık mevcut olsa da gerçek deployment konfigürasyonu ayrıca doğrulanmalıdır.

*Bu rapor AI-assisted source synthesis ve yerel kod/runtime incelemesiyle hazırlanmıştır. Kritik production kararları için P0 maddelerindeki gerçek entegrasyon ve postcondition testleri ayrıca yapılmalıdır.*
