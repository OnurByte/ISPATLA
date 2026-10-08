# İSPATLA — Canonical Product, Auth, X API, Intelligence & UX Master Plan v3

> **Durum:** Codex implementation master plan
> **Tarih:** 7 Ekim 2026
> **Domain:** `ispatla.tr`
> **Repository:** `OnurByte/ISPATLA`
> **Amaç:** İSPATLA’yı tek kullanıcılı/internal bir X dashboard’undan; açık kaynak kimliği olan, çok hesap bağlayabilen, resmi X API ile güvenli publish yapan, kararlarını kanıtlayan ve zamanla kendi fırsat seçimlerini kalibre eden gerçek bir ürüne dönüştürmek.

---

# 0. Belgenin otoritesi

Bu belge bundan sonraki refactor/migration için ana sözleşmedir.

Codex bu belgeyi uygularken:

- mevcut çalışan radar, scoring, Jev, voice profile, draft evaluator, worker, `PublicationIntent`, reconciliation ve provider-independent reader temellerini **korumalı**;
- `x-use` için yeni fallback, compatibility shim veya cookie/browser yolu **eklememeli**;
- UI refactor bahanesiyle backend davranışını sessizce değiştirmemeli;
- yeni intelligence modellerini mevcut outcome verisi olmadan doğrudan auto-publish gate yapmamalı;
- X’in resmi automation kurallarını ihlal eden özellikler eklememeli;
- “viral garanti”, “X algoritmasını kopyaladık”, “internal X score” gibi doğrulanamaz ürün iddiaları kullanmamalı.

Ana ürün döngüsü:

```text
observe
→ understand
→ decide
→ compose
→ gate
→ publish
→ verify
→ learn
```

İSPATLA’nın moat’ı “AI tweet yazıyor” değildir.

Moat:

```text
çok sayıda X sinyali
→ aynı olayı birleştir
→ normal davranıştan sapmayı bul
→ kaynak güvenini hesapla
→ doğru hesaba eşle
→ doğru anda doğru formatı seç
→ policy ile güvenli publish et
→ sonucu izle
→ kaçırılan fırsatlardan da öğren
```

---

## 0.1 V3 precedence ve araştırma kapsamı

Bu V3, önceki `ISPATLA_FINAL_MASTER_PLAN.md` ve `ISPATLA_FINAL_MASTER_PLAN_V2.md`
dosyalarının yerini alır. Çelişki halinde **V3 geçerlidir**.

V3 hazırlanırken yalnız son konuşma değil, İSPATLA hakkında daha önce verilen
kararlar da yeniden birleştirildi:

- SuperX Discover + XPatla Market benzeri ilk ürün fikri;
- 500–1000 kaynak post tarama, velocity/acceleration, event clustering, original
  source/lineage ve feedback loop;
- `Event → Claim → Observation` veri modeli;
- Expected Incremental Reach (EIR);
- broadcast-vs-cascade ayrımı;
- source-topic reputation;
- competitor gap;
- account×category learning;
- shadow/champion/challenger;
- CatBoost/LightGBM gibi tabular challenger modeller;
- account/purpose bazlı AI routing;
- `XReader` / `XPublisher` provider boundary;
- adaptive monitor + Discovery Query Engine;
- `PublicationIntent`, idempotency, receipt, reconciliation;
- x-use'ın tamamen kaldırılması;
- Better Auth ile app auth ve custom X OAuth'ın ayrılması;
- `ispatla.tr` productization;
- açık kaynak kimliği;
- Shadcn tabanını koruyup generic admin-template görünümünden kaçınma;
- creator 3D tilt card, fiziksel motion, tek design register;
- X automation policy, explicit consent ve official X write path.

Araştırma ayrıca Ekim 2026 itibarıyla:

- güncel resmi X OAuth/API/automation dokümanları;
- güncel `xai-org/x-algorithm` açık kaynak kodu ve README;
- Better Auth'ın güncel account-linking/refresh-token edge-case tartışmaları;
- düşük yıldızlı GitHub repolarındaki durable queue, HITL, calibration, online
  clustering, coordination detection ve microinteraction pattern'leri;
- Reddit'teki scheduler, SaaS onboarding, dashboard, OAuth ve OSS contributor
  deneyimleri

ile çaprazlandı.

Bu belge bir “feature wishlist” değildir. Her bölüm ya ürün sözleşmesi, ya
mimari invariant, ya rollout/test gereksinimi, ya da araştırmadan çıkarılmış
ve İSPATLA'ya uyarlanmış bir primitive'dir.

# 1. Non-negotiable ürün kararları

Bunlar tercih değil, migration constraint’tir.

## 1.1 x-use tamamen kalkacak

Final product içinde şunların hiçbiri bulunmayacak:

- `x-use`
- x-use MCP process
- Chromium/browser automation
- Twitter/X cookie dosyaları
- `x-use doctor`
- `XUSE_BIN`
- `XUSE_CWD`
- `xuseAccountId`
- `xuseQueueId`
- `xuseStatus`
- x-use health endpoint’leri
- x-use queue sync endpoint’leri
- x-use fallback
- “official API bozulursa browser’a dön” mantığı

Authenticated write path’in tek kaynağı:

```text
Official X API
```

Public/read radar transport’u provider-independent kalır. Bugünkü FxTwitter adapter’ı kullanılabilir; fakat ürün mimarisi `XReader` interface’ine bağlı kalmalıdır.

---

## 1.2 App auth ve X authorization iki farklı şeydir

**Better Auth** yalnız İSPATLA kullanıcı hesabı/session sistemi olacaktır.

X hesabı bağlamak ayrı bir OAuth 2.0 Authorization Code + PKCE akışıdır.

```text
Better Auth
└── İSPATLA user/session

Custom X OAuth 2.0 PKCE
└── X account connections
    └── token vault
        └── Official X API
```

Şunları yapma:

```text
X login == İSPATLA login
Better Auth social provider == publisher account
Clerk
X provider tokenlarını Better Auth account-linking tablosuna publisher source of truth olarak koymak
```

Neden:

1. Bir İSPATLA kullanıcısı birden fazla X hesabı bağlayabilmeli.
2. X hesabı burada “login identity” değil, ürünün yönettiği harici bir resource’dur.
3. Publisher token lifecycle’ı app session lifecycle’ından bağımsız olmalıdır.
4. Reauthorization, scope upgrade, refresh rotation, revoke ve token health product-level kavramlardır.
5. Better Auth provider-linking mantığı bu işi gereksiz yere auth identity problemine dönüştürür.

---

## 1.3 Final baseline X OAuth scope set

İSPATLA’nın baseline izinleri:

```text
tweet.read
tweet.write
users.read
media.write
offline.access
```

İstenmeyecek baseline scope’lar:

```text
dm.read
dm.write
like.write
like.read
follows.write
follows.read
bookmark.*
list.*
mute.*
block.*
tweet.moderate.write
users.email
```

### Neden

- `tweet.write`: original post + reply + Repost işlemleri.
- `tweet.read`: target/reference/reconciliation için.
- `users.read`: bağlı hesabı `/users/me` benzeri user-context ile doğrulamak için.
- `media.write`: görsel/video yüklemek için.
- `offline.access`: refresh token ve uzun ömürlü bağlantı için.

### Policy düzeltmesi

**Automated likes ürün özelliği olmayacak.**

X’in Nisan 2026 automation rules’u automated likes’ı açıkça yasaklıyor.

Bu nedenle:

```text
like.write
```

teknik olarak API’de bulunsa bile İSPATLA automation surface’ine eklenmeyecek.

---

## 1.4 DM yok

Şunlar ürün scope’unda yok:

```text
dm.read
dm.write
DM composer
DM automation
DM agent action
```

---

## 1.5 Repost / RT var

Final action surface içinde:

```text
post
repost
reply
```

baseline desteklenecek.

Quote-post ayrı capability olarak ele alınacak.

---

## 1.6 Quote post capability-gated

7 Ekim 2026 itibarıyla X’in resmi Create Post dokümantasyonu `quote_tweet_id` kullanımını self-serve/pay-per-use tier’larda değil Enterprise entitlement altında gösteriyor.

Dolayısıyla UI veya agent:

```text
quote destekleniyor
```

diye varsaymayacak.

Capability modeli:

```ts
{
  post: true,
  reply: true,
  repost: true,
  media: true,
  quote: false | true, // entitlement
}
```

Quote unavailable ise:

- buton disabled/hidden;
- neden UI’da açıklanır;
- browser automation fallback yapılmaz;
- x-use geri gelmez.

---

## 1.7 Runtime intelligence kaynağı yalnız X

Bu karar eski konuşmalardan gelen açık kullanıcı constraint'idir ve V3'te tekrar
sertleştirilir:

```text
İSPATLA runtime intelligence source = X
```

Radar/event/opportunity motoru RSS, haber sitesi, Reddit, Telegram, Google News
veya genel web crawler verisini source-of-truth olarak ingest etmeyecek.

Bu, “X üzerindeki postlarda URL göremeyiz” anlamına gelmez. İSPATLA:

- X post içindeki URL/entity metadata'sını kaydedebilir;
- aynı URL fingerprint'ini lineage/corroboration sinyali olarak kullanabilir;
- quoted/reposted/replied post zincirlerini takip edebilir;
- X'in kendi News/Trend/Search gibi yüzeylerinden gelen metadata'yı, erişim ve
  policy uygunsa, **X içi veri** olarak kullanabilir.

Fakat event doğrulamak için linke gidip dış web sayfasını runtime radar kaynağı
olarak scrape etmek bu ürün sözleşmesinin dışındadır.

Bu constraint mimaride şu sonucu doğurur:

```text
X-only data plane
        │
        ├─ FxTwitterReader (bugünkü adapter)
        ├─ OfficialXReader (opsiyonel / entitlement-cost aware)
        └─ future X-only reader adapter
```

Core pipeline herhangi bir reader'ın response şekline değil canonical `XPost`,
`XProfile`, `XMetricSnapshot`, `XTimelineBatch`, `XSearchResult` modellerine
bağlanmalıdır.

**FxTwitter ürünün kendisi değildir.** Bugünkü uygun transport olabilir ama
İSPATLA source discovery, event model ve DB şemasını FxTwitter'a özel alanlara
kilitlememelidir.

---

## 1.8 Account ve purpose bazlı AI routing korunacak

Eski plandaki “her hesap için farklı model/provider” kararı korunur.

Tek global:

```text
AI_MODEL=gpt-...
```

yaklaşımı final mimari değildir.

Routing en az şu boyutları desteklemeli:

```text
account
purpose
category
risk tier
cost tier
```

Purpose örnekleri:

```text
source/profile understanding
event merge/split adjudication
relevance rerank
draft generation
draft judge
policy explanation
voice-profile refresh
```

Örnek:

```text
@accountA draft      → GPT / high-quality route
@accountA rerank     → Jev
@accountB draft      → Grok
cheap source pass    → lower-cost compatible model
hard policy          → NO LLM, deterministic
```

Mevcut `aiRouteOverride` / draft model routing yaklaşımı korunup ürünleşmeli.

Model/provider seçimi audit'e:

```text
provider
model
purpose
route reason
prompt version
cost
latency
```

olarak yazılmalıdır.

---

## 1.9 OAuth consent ile automation consent aynı şey değildir

Resmi X automation kuralları açısından kritik ayrım:

```text
X OAuth grant
!=
kullanıcının otomatik aksiyonlara açık rızası
```

Kullanıcı X hesabını bağladığında token vermiş olur; bu tek başına İSPATLA'nın
o hesap üzerinden otomatik post/repost/reply yapması için ürün seviyesinde
yeterli consent kabul edilmemelidir.

Yeni tablo/sözleşme:

```sql
automation_consents
- id
- owner_user_id
- account_id
- action_type
- mode
- policy_version
- consent_copy_version
- granted_at
- revoked_at
- created_at
```

`action_type`:

```text
post
repost
reply
future_quote
```

Consent UI açıkça:

- hangi otomatik eylemlerin yapılacağını;
- hangi mode'da yapılacağını;
- günlük/cadence limitini;
- kullanıcının nasıl kapatacağını

söylemelidir.

App'in amaç veya automation davranışı anlamlı biçimde değişirse ilgili consent
yenilenmelidir.

Disconnect/pause/opt-out gecikmeden uygulanmalıdır.

---

## 1.10 X-only ama transport bağımsız

“Yalnız X” constraint'i şu yanlış tasarıma dönüşmemeli:

```text
tüm reader kodunu tek unofficial HTTP response'una göm
```

Doğru ayrım:

```text
Data domain = X only
Transport = replaceable
```

Official X read endpoint'leri maliyet/entitlement açısından uygun olduğunda
aynı canonical reader contract'a eklenebilir. Bu migration official read'i
zorunlu kılmaz; yalnız vendor/transport lock-in'i engeller.

# 2. İSPATLA’nın ürün tanımı

## 2.1 Tek cümle

> İSPATLA, yalnız X üzerindeki sinyalleri olay ve fırsatlara dönüştüren, doğru hesap için yayın kararını kanıt zinciriyle veren ve sonucu ölçerek zamanla daha iyi karar veren açık kaynak bir X intelligence ürünüdür.

## 2.2 Ürün ne değildir

İSPATLA:

- yalnız scheduler değildir;
- yalnız AI caption generator değildir;
- X scraping UI değildir;
- X’in internal For You algoritmasını kopyalamaz;
- viralliği garanti etmez;
- “trend bul → otomatik spam at” botu değildir;
- engagement farm değildir;
- otomatik like/follow sistemi değildir.

## 2.3 Temel value proposition

Kullanıcıya şu dört şeyi tek yerde vermeli:

```text
1. Ne oluyor?
2. Neden şimdi önemli?
3. Benim hangi hesabım için uygun?
4. Ne yapmalıyım ve yayınlandıktan sonra ne oldu?
```

Dashboard’un bilgi mimarisi de bu dört soruya göre kurulmalıdır.

---

# 3. Public product ve private control room ayrımı

Önceki internal dashboard yaklaşımının en büyük product UX problemi, marketing/product kimliği ile operational control plane’in aynı sayfada karışmasıdır.

Final yapı:

```text
ispatla.tr/
    public product surface

ispatla.tr/app
    authenticated control room
```

## 3.1 Public routes

Önerilen:

```text
/
 /docs
 /security
 /privacy
 /terms
 /login
 /signup
```

Landing page’in işi:

- İSPATLA’nın ne yaptığını 10 saniyede anlatmak;
- open-source olduğunu göstermek;
- GitHub’a götürmek;
- gerçek ürün screenshot’ları göstermek;
- nasıl çalıştığını açıklamak;
- giriş/signup CTA vermek.

Landing page **admin dashboard screenshot koleksiyonu** gibi olmamalı.

## 3.2 App routes

Önerilen primary product IA:

```text
/app
/app/opportunities
/app/drafts
/app/queue
/app/accounts
/app/analytics
```

Secondary/settings:

```text
/app/sources
/app/categories
/app/settings/automation
/app/settings/ai
/app/settings/keys
/app/settings/style
/app/settings/policy
```

Bugünkü `/x` inspector gibi engineering/debug surface primary sidebar’da olmamalı.

Gerekirse:

```text
/app/developer/x
```

altına taşınabilir.

---

# 4. Better Auth planı

## 4.1 Neden Better Auth

İSPATLA’nın ihtiyacı:

- FOSS/self-hosted;
- Next.js/TypeScript uyumu;
- DB-backed session;
- browser’da HttpOnly session cookie;
- kullanıcı/session lifecycle’ını kendimiz kontrol edebilme;
- Clerk vendor dependency’sini kaldırma.

Better Auth bu role uygundur.

Fakat publisher X OAuth hesabını Better Auth’a emanet etmeyeceğiz.

---

## 4.2 Session modeli

**DB-backed session kullan.**

Stateless/JWT-only auth yapma.

Neden:

- revoke/logout kontrolü;
- session listesi;
- daha güvenilir production behavior;
- OAuth/account-cookie edge-case’lerinden kaçınma;
- kullanıcı silme/revocation daha kolay.

Browser:

```text
HttpOnly
Secure
SameSite=Lax
```

cookie kullanmalı.

Token/session browser `localStorage`’a yazılmamalı.

---

## 4.3 İlk auth surface minimal olmalı

Signup ekranında sadece gerçekten gerekli şeyleri iste.

MVP:

```text
email
password
```

Opsiyonel name/company/role/team-size isteme.

Bunlar onboarding’de bile zorunlu olmamalı.

Public launch öncesi:

- email verification;
- password reset;
- rate limit;
- brute-force protection;
- session revoke

tamamlanmalı.

Private beta’da verification delivery henüz yoksa bu teknik borç explicit feature flag ile tutulmalıdır.

---

## 4.4 Team/org sistemi şimdilik ekleme

Better Auth org/multi-tenancy plugin’lerine bu migration’da girme.

İlk product contract:

```text
1 İSPATLA user
→ N X accounts
```

Takım/workspace ihtiyacı gerçek kullanıcı talebiyle sonra eklenir.

Premature org model product/auth migration’ını büyütür.

---

# 5. X OAuth 2.0 PKCE tasarımı

## 5.1 Callback

Production callback:

```text
https://ispatla.tr/api/x/oauth/callback
```

Developer Console’da exact match olmalı.

Dev callback ayrı kayıt:

```text
http://localhost:3000/api/x/oauth/callback
```

---

## 5.2 Connect flow

```text
User
→ Connect X
→ POST /api/x/oauth/start
→ random state
→ random code_verifier
→ S256 code_challenge
→ server stores one-time OAuthTransaction
→ redirect X authorize
→ user grants scopes
→ X callback
→ consume transaction atomically
→ exchange auth code
→ GET authenticated user identity
→ verify granted scopes
→ encrypt tokens
→ save X account
→ redirect /app/accounts/{id}
```

`state`:

- high entropy;
- user/session-bound;
- single use;
- short TTL;
- hash stored where possible.

`code_verifier`:

- server side;
- never browser local storage;
- transaction TTL kadar yaşar.

`return_to`:

- yalnız internal allowlist route;
- arbitrary redirect kabul etme.

---

## 5.3 Auth code timing

X auth code kısa ömürlüdür.

Callback mümkün olduğunca:

```text
validate state
→ exchange immediately
```

yapmalı.

Callback içine AI call, profile crawling, analytics, screenshot vb. koyma.

---

# 6. X account ve credential data model

Mevcut `accounts` tablosunu editorial/product identity olarak koru.

Tokenları aynı row’a koyma.

## 6.1 accounts

Hedef:

```sql
accounts
- id
- owner_user_id
- account_key
- x_user_id
- handle
- display_name

- enabled
- default_account
- automation_mode
- daily_limit
- capabilities_json
- style_profile_json

- auth_state
- connected_at
- last_health_at
- last_auth_error

- created_at
- updated_at
```

`handle` mutable olabilir.

Kimlik primary key’i:

```text
x_user_id
```

olmalıdır.

X username değişebilir.

---

## 6.2 x_oauth_credentials

```sql
x_oauth_credentials
- id
- account_id UNIQUE

- encrypted_access_token
- encrypted_refresh_token
- encryption_key_id

- access_expires_at
- scopes_json
- token_version

- refreshed_at
- revoked_at
- created_at
- updated_at
```

Bu tablo normal dashboard query’sine join edilmemeli.

Credential existence için metadata projection kullan:

```ts
{
  connected: true,
  expiresAt,
  scopes,
  refreshedAt
}
```

Ciphertext API response’a çıkmamalı.

---

## 6.3 x_oauth_transactions

```sql
x_oauth_transactions
- id
- owner_user_id
- state_hash UNIQUE
- encrypted_code_verifier
- requested_scopes_json
- return_to
- expires_at
- consumed_at
- created_at
```

Callback replay:

```text
consumed_at != null
```

ise reddedilir.

---

# 7. Token vault

Mevcut server-side AES-256-GCM secret-vault yaklaşımı yeniden kullanılabilir fakat X account tokenları first-class credential storage olarak ayrılmalı.

Her encrypted record:

```text
ciphertext
iv
auth_tag
key_id
version
```

mantığı taşımalı.

## 7.1 Key rotation

Tek global secret’e sonsuza kadar kilitlenme.

Config:

```text
ISPATLA_TOKEN_KEY_CURRENT
ISPATLA_TOKEN_KEY_PREVIOUS_*
```

veya versioned keyring.

Yeni yazılar current key ile.

Okumada `key_id` seç.

Background re-encrypt daha sonra yapılabilir.

---

## 7.2 Logging

Şunlar loglanmayacak:

```text
access token
refresh token
authorization code
code_verifier
client secret
raw Authorization header
full OAuth callback query
```

Structured log sanitizer zorunlu.

---

# 8. Refresh token lifecycle

X access token default kısa ömürlüdür; `offline.access` refresh token sağlar.

Write path token expiry’ye çarpmamalı.

## 8.1 Preflight refresh

Her write öncesi:

```text
if expires_at < now + refresh_buffer:
    refresh
```

Buffer örneğin config’den okunmalı.

Hard-code business logic içine gömülmesin.

---

## 8.2 Single-flight refresh

Aynı X account için iki worker eşzamanlı refresh yapmamalı.

DB-level/account-level lock:

```text
refresh(account_id)
→ claim refresh lease
→ reread credential
→ someone already refreshed? use new token
→ else refresh
→ CAS token_version
```

Refresh token rotation varsa eski tokenı ikinci worker’ın kullanması engellenir.

---

## 8.3 Refresh failure state

Örnek states:

```text
connected
refreshing
reauthorization_required
revoked
scope_missing
disabled
```

`invalid_grant`:

```text
reauthorization_required
```

yapmalı.

Sonsuz retry loop yapma.

UI:

```text
X bağlantısı yenilenmeli
[yeniden bağla]
```

göstermeli.

---

# 9. Better Auth ile X bağlantısını neden ayırıyoruz

Araştırmadan çıkan önemli engineering kararı budur.

Better Auth:

```text
user login identity
session
password/reset/verification
```

yönetir.

X connection:

```text
resource authorization
external account credentials
publisher permissions
```

yönetir.

Bunları aynı abstraction’a koymamanın faydaları:

- aynı user’a birden fazla X hesabı;
- provider identity conflict daha az;
- X scope upgrade bağımsız;
- X revoke auth session’ı kapatmaz;
- Better Auth update X publisher’ı kırmaz;
- token refresh bugs publisher state’ini auth state’inden ayırır;
- X account başka app user’a zaten bağlıysa explicit ownership conflict gösterilir.

---

# 10. Official X API client

Yeni katmanlar:

```text
src/server/x/
  oauth.ts
  token-vault.ts
  client.ts
  capabilities.ts
  policy.ts
  publisher.ts
  errors.ts
  types.ts
```

## 10.1 x/client.ts

Tek bir typed client surface:

```ts
getMe()
createPost()
reply()
repost()
undoRepost()
uploadMedia()
getPost()
getUserPosts()
```

Quote:

```ts
quote()
```

yalnız capability varsa.

Raw fetch bütün codebase’e dağılmasın.

---

## 10.2 Error taxonomy

HTTP status’u UI string’e çevirmek yeterli değil.

Canonical:

```text
auth_revoked
auth_scope_missing
rate_limited
entitlement_missing
invalid_media
policy_blocked
remote_validation
remote_unavailable
network_unknown
timeout_unknown
not_found
conflict
```

Her error:

```ts
{
  code,
  safeToRetry,
  remoteStateKnown,
  retryAfter?,
  userMessage,
  operatorDetail
}
```

taşımalı.

---

# 11. Publisher abstraction migration

Mevcut `XPublisher` interface iyi bir boundary’dir.

Korunmalı.

## 11.1 Hedef

Bugün:

```text
XPublisher
└── XUsePublisher
```

Final:

```text
XPublisher
└── OfficialXPublisher
```

Final product’ta XUsePublisher kalmayacak.

---

## 11.2 ActionIntent

`PublicationIntent` daha genel bir write contract’a evrilmeli.

Öneri:

```ts
type XAction =
  | "post"
  | "repost"
  | "reply"
  | "quote"
  | "thread";
```

No:

```text
like
dm
follow
```

Intent:

```ts
type ActionIntent = {
  id: number;
  action: XAction;
  accountId: number;

  targetPostId?: string;
  text?: string;
  mediaRefs?: string[];

  opportunityId?: number;
  draftId?: number;

  idempotencyKey: string;
  policyDecisionId: number;

  revision: number;

  requestedAt: number;
  approvedAt?: number;
  scheduledAt?: number;
};
```

---

# 12. Claim-before-send ve idempotency

Bu migration’ın en önemli backend invariant’larından biridir.

X create endpoint’i application-level idempotency key verdiğimizi varsaymamalı.

İSPATLA kendi authority’sini tutmalı.

Write öncesi:

```text
BEGIN
INSERT dispatch_claim(idempotency_key UNIQUE)
COMMIT

then remote side effect
```

Unique claim başarısız:

```text
already claimed
→ do not send again
```

Bu pattern worker restart’ta duplicate post’u önler.

---

## 12.1 Network unknown state

En tehlikeli durum:

```text
POST X API
→ X işlemi yaptı
→ response yolda kayboldu
→ ISPATLA timeout gördü
```

Burada:

```text
retry POST
```

yapma.

Status:

```text
unknown_remote_state
```

olmalı.

Sonra reconciliation:

- selected account;
- time window;
- expected text hash;
- known media;
- target/reply relation

ile remote state kontrol edilir.

Bulunursa confirmed.

Bulunmazsa ancak explicit safe retry policy’ye girilir.

---

# 13. Publication state machine

Önerilen canonical state:

```text
draft
pending_approval
approved
scheduled
dispatch_claimed
dispatching
dispatched
pending_reconciliation
confirmed
```

Terminal/exception:

```text
blocked
cancelled
expired
unknown_remote_state
reauthorization_required
failed_safe
```

`failed` tek başına yeterli değildir.

---

# 14. Receipt ≠ confirmed

Official API’ye geçmek bu ilkeyi değiştirmez.

```text
201 + post_id
```

çok güçlü receipt’tir ama internal analytics’te iki aşama tutulabilir:

```text
dispatched
confirmed
```

`confirmed`:

- remote object tekrar okunabildi;
- expected author;
- expected action relation;
- expected text/media

uyuşuyorsa set edilir.

Bu mevcut reconciliation kültürünü korur.

---

# 15. Scheduled queue sözleşmesi

Reddit/social scheduler araştırmalarından çıkarılacak iyi pattern:

Bir post **approved/scheduled** olduktan sonra identity’sini sessizce değiştirme.

## 15.1 Immutable after approval

Approved intent’te şu alanlar değişirse:

```text
account
action
target
text
media
```

eski approval geçersiz olur.

Yeni revision oluştur:

```text
revision + 1
→ pending_approval
```

Account değişikliği “edit” gibi görünmemeli.

Cancel + new intent veya new revision.

Bu audit’i temiz tutar.

---

## 15.2 Queue görünümleri

İki view:

```text
List
Calendar
```

Calendar post management ürünlerinde gerçek kullanıcı beklentisidir.

Queue item:

```text
account
action
preview
scheduled exact time
relative time
approval state
auth health
policy state
publish state
```

göstermeli.

---

## 15.3 Failure UX

Başarısız scheduled post:

```text
Kırmızı “failed”
```

deyip bırakılmamalı.

Örnek:

```text
Yayınlanamadı
Neden: X bağlantısı yeniden yetkilendirilmeli
Etkisi: gönderi X’e ulaşmadı
[Hesabı yeniden bağla]
[İşi iptal et]
```

Rate limit:

```text
X sınırı nedeniyle bekliyor
En erken: 14:32
```

---

# 15A. Durable queue: lease, heartbeat, janitor ve dead-letter

Düşük yıldızlı `amitbara3/taskyard` araştırmasındaki en değerli production
primitive, queue'yu yalnız `status='queued'` satırı değil **lease edilen durable
job** olarak ele almaktır.

İSPATLA worker modeli şu invariant'a evrilmelidir:

```text
queued
→ reserved(lease_owner, lease_until)
→ running
→ terminal
```

Worker işi alırken atomik claim yapar. SQLite'da tek node için uygun pattern:

```text
BEGIN IMMEDIATE
find due eligible job
update lease owner / lease expiry / attempt
COMMIT
```

İş uzun sürüyorsa heartbeat lease'i uzatır.

Worker ölürse janitor:

```text
lease_until < now
```

işlerini stale olarak işaretleyip state'e göre:

- güvenli read/generation işi ise retry queue'ya;
- remote X write başlamamışsa retry queue'ya;
- remote X write başlamış/unknown ise **reconciliation_required** durumuna

taşır.

Bu ayrım zorunludur. “Worker öldü → bütün running işleri retry et” duplicate post
üretebilir.

## 15A.1 Attempt sayısı reservation anında artar

Crash-loop olan bir job sonsuza kadar ücretsiz retry almamalı.

```text
attempt += 1
```

iş başarılı olduktan sonra değil lease claim anında artmalıdır.

Böylece:

```text
reserve
→ process crash
→ reserve
→ crash
```

döngüsü max-attempt sınırına ulaşabilir.

## 15A.2 Backoff + jitter

Retry-safe işler:

```text
base_delay × 2^attempt + jitter
```

ile ertelenir.

Aynı anda X/AI provider bozulduğunda binlerce job'ın aynı saniyede yeniden
uyanması engellenir.

429 için generic exponential delay yerine provider'ın `Retry-After` veya
`x-rate-limit-reset` bilgisi varsa o otoritedir.

## 15A.3 Dead-letter queue

Max attempt sonrası iş görünmez biçimde “failed” olmamalı.

```text
dead_letter_jobs
```

veya canonical job status:

```text
dead_letter
```

kullan.

DLQ ekranı hata signature'ına göre gruplanabilmeli:

```text
auth_revoked × 18
rate_limited × 4
media_invalid × 3
unknown_remote_state × 1
```

Operatör:

```text
inspect
retry eligible
cancel
reauthorize account
```

aksiyonlarını alabilmeli.

## 15A.4 Job event timeline

Her job için append-only event:

```text
created
approved
scheduled
reserved
heartbeat
dispatch_claimed
request_sent
receipt_received
reconcile_started
confirmed
failed
retry_scheduled
dead_lettered
```

UI'daki “Action Receipt” bu event stream'den türetilsin.

---

# 15B. Transactional outbox ve dürüst exactly-once semantiği

`HazemDev-1/outbox-relay` gibi küçük outbox örneklerinden alınacak temel ders:

```text
database transaction
→ side effect intention
```

aynı otoritede atomik tutulmalı.

Ama X gibi external API side effect'inde gerçek “exactly once” garantisi
uygulamanın kontrolünde değildir.

İSPATLA'nın garantisi şu olmalı:

> Aynı intent'i bilinçli olarak ikinci kez dispatch etmemek ve remote durum
> belirsizse kör retry yerine reconciliation'a geçmek.

Yani marketing/docs içinde:

```text
exactly-once X publishing
```

iddiası kullanma.

Doğru invariant:

```text
at-most-one intentional dispatch claim
+ explicit unknown-remote-state recovery
+ remote reconciliation
```

## 15B.1 Local truth before success toast

Scheduler araştırmalarında sık görülen kötü UX:

```text
“Scheduled successfully”
```

toast'u gösteriliyor ama job kalıcı store/calendar'da yok.

İSPATLA yalnız şu durumda “Planlandı” diyebilir:

```text
intent persisted
AND schedule persisted
AND queue registration/next-run state persisted
```

UI optimistically success vermesin.

Remote publish için:

```text
dispatched != confirmed
```

ayrımı da görünür kalır.

# 16. X capability registry

Product UI feature varsaymamalı.

Endpoint:

```text
GET /api/x/capabilities
```

Örnek:

```json
{
  "post": {
    "enabled": true
  },
  "reply": {
    "enabled": true,
    "policy": "opt_in_or_manual"
  },
  "repost": {
    "enabled": true
  },
  "media": {
    "enabled": true
  },
  "quote": {
    "enabled": false,
    "reason": "enterprise_entitlement_required"
  }
}
```

UI, agent ve queue aynı source of truth’u kullanır.

---

# 17. X automation policy engine

Policy LLM prompt’un içinde saklanmamalı.

Deterministic server policy olmalı.

## 17.1 Automated likes

```text
DENY
```

Her zaman.

---

## 17.2 Automated unsolicited replies

Keyword search:

```text
search "AI"
→ random people'a reply
```

DENY.

Auto-reply için eligibility evidence gerekir.

Örnek:

```text
user replied to our post
user mentioned our account requesting response
explicit campaign opt-in event
manual operator approval
```

Her eligibility event audit’lenmeli.

---

## 17.3 Trending topics

X Trends endpoint/listesi:

```text
trend → immediately autopost
```

DENY.

İSPATLA tek veri kaynağı olarak X üzerinde kalabilir.

Ancak fırsat:

```text
configured source graph
multiple observed posts
event emergence
source evidence
```

ile oluşmalı.

`x_trending_topic` yalnız context olabilir, auto-publish trigger olamaz.

---

## 17.4 Duplicate / substantially similar content

Policy:

```text
same account near-duplicate
cross-account near-duplicate
same event same wording
copy source text
```

kontrol eder.

Similarity sadece exact string olmamalı.

Store:

```text
normalized text fingerprint
simhash/embedding
canonical cluster id
```

Cross-account aynı event için içerik gerçekten distinct purpose/style taşımıyorsa publish engellenir.

---

## 17.5 Repost policy

Automated Repost teknik olarak allowed use-case olabilir fakat:

- bulk/aggressive değil;
- repost frequency limit;
- same source cooldown;
- same cluster cooldown;
- cross-account amplification check;
- kendi hesabını birden fazla hesapla yapay boost etme engeli.

---

# 18. Product mode sistemi

Kullanıcı “automation açık/kapalı” binary’sine mahkûm olmamalı.

Üç product mode:

## Observe

```text
radar
opportunities
analytics
no writes
```

## Assist

```text
radar
draft
policy
human approve
publish
```

## Auto

```text
radar
draft
policy
eligible actions auto-approved
publish
```

Auto mode bile policy bypass edemez.

---

# 18A. Earned automation: autonomy dar action-shape üzerinden kazanılır

`parth012001/greenlight` araştırmasından alınacak güçlü fikir: güven
“bu kullanıcı Auto açtı” diye global boolean olmamalıdır.

İSPATLA'da trust shape:

```text
(account, action, category, riskTier)
```

minimumunda izlenebilir.

Örnek:

```text
@OnurStirner
post
technology
low-risk
```

ile:

```text
@OnurStirner
reply
politics
high-risk
```

aynı autonomy hakkını taşımaz.

Sistem bir shape'in uzun süre:

- insan tarafından onaylandığını;
- policy block üretmediğini;
- auth/remote failure yaşamadığını;
- duplicate/copy riski taşımadığını

görürse kullanıcıya:

```text
Bu işlem tipi için otomatik onayı açmak ister misin?
```

diye **öneri** sunabilir.

Kendiliğinden promote etmez; X explicit automation-consent gereksinimi nedeniyle
kullanıcı açıkça onaylar.

Autonomous run policy/auth safety failure üretirse sistem ilgili shape'i
otomatik olarak:

```text
assist/manual
```

seviyesine demote edebilir.

Bu, “full autopilot” ürün seçeneğini kaldırmaz. Full autopilot kullanıcının
açık consent'iyle birçok action-shape'i enable eder; fakat iç policy engine
yine her shape'i bağımsız gate eder.

---

# 18B. Policy simulator: kural değişikliğini geçmişte replay et

`iveteamorim/decision-room` benzeri deterministic decision-system pattern'i
İSPATLA için çok değerlidir.

Policy değişikliği:

```text
publish threshold 78 → 70
reply auto approval
repost cooldown
duplicate threshold
category risk mode
```

direkt production'a alınmamalı.

Önce historical intent/opportunity ledger üzerinde simülasyon:

```text
old policy decisions
vs
new policy decisions
```

çıkar.

UI:

```text
Son 30 günde bu değişiklik:

+37 intent'i auto-approve ederdi
-4 mevcut publication'ı block ederdi
+11 politics reply'i autonomous hale getirirdi
+18 duplicate-risk intent'i geçirirdi
```

gibi **counterfactual diff** göstermeli.

Yüksek riskli policy change'i kullanıcı bu simülasyonu görmeden activate etmemeli.

Policy version her `ActionIntent` ve `DecisionRecord` içine yazılmalıdır.

# 19. Shadow / Live operational mode

Global çok görünür bir state:

```text
SHADOW
LIVE
```

SHADOW:

- real radar;
- real scoring;
- real drafts;
- real queue simulation;
- no remote writes.

Bu hem onboarding hem production rollout için kullanılır.

UI üst bar/status:

```text
Shadow mode
Hiçbir işlem X’e gönderilmiyor.
[Live’a geç]
```

Live’a geçiş destructive confirmation ister.

---

# 20. İlk kullanım / onboarding

İlk login sonrası boş dashboard göstermeyin.

Reddit onboarding araştırmalarındaki ana sorun:

```text
signup
→ empty sidebar
→ no clue
→ leave
```

İSPATLA onboarding’in hedefi:

```text
first useful result
```

olmalıdır.

---

## 20.1 First-run akışı

Öneri:

```text
1. 10 saniyelik product explanation
2. Shadow mode açık
3. Hazır read-only radar/opportunity örneği göster
4. Bir fırsat detail açtır
5. "Bu fırsat neden önemli?" explanation göster
6. Sonra "X hesabını bağla"
7. Hesap voice/category çıkar
8. İlk draft üret
9. User approve
10. İlk confirmed post
```

Kullanıcı X bağlamadan önce ürünün beynini görmeli.

---

## 20.2 Demo/sample data

İki seçenek:

1. Canlı public radar verisi.
2. Deterministic sample fixture.

Sample data açıkça:

```text
Demo data
```

olarak etiketlenir.

Gerçek veri gibi gösterilmez.

---

## 20.3 Zero-config ilk değer

İlk ekranda kullanıcıdan şunları doldurmasını isteme:

```text
20 source
12 category
daily limits
model routing
AI provider
scheduler interval
```

Bunlar advanced settings’tir.

Default product config çalışır durumda gelmeli.

---

# 21. App navigation refactor

Bugünkü sidebar çok fazla internal subsystem’i eşit seviyede sunuyor.

Primary nav:

```text
Overview
Opportunities
Drafts
Queue
Accounts
Analytics
```

Secondary:

```text
Intelligence
Automation
AI
Settings
Developer
```

Sources/categories primary nav’dan kaldırılabilir veya `Intelligence` altında birleşebilir.

---

# 22. Overview ekranı

Overview bütün operasyonu tekrar eden kartlar değil, şu soruların cevabı olmalı:

```text
Sistem çalışıyor mu?
Şu anda ne önemli?
Benden ne gerekiyor?
Son yayınlarda ne oldu?
```

Üst:

```text
system mode
connected accounts
radar state
publisher health
```

Ana:

```text
Top opportunities
Pending approvals
Publishing failures
Recent confirmed
```

İkincil:

```text
24h observed
opportunity conversion
source health
API usage
```

---

# 23. Opportunity UX

Opportunity list item sadece skor göstermesin.

Card/row:

```text
canonical event
stage
age
emergence
evidence count
best account
publish confidence
why now
```

Örnek:

```text
Claude yeni model varyantı konuşuluyor
BREAKOUT · 12 dk

Emergence        91
Independent src   6
Account fit       88
Saturation        24
Publish conf.     84

Why now:
+ 10 dk velocity baseline'ın 8.4× üstünde
+ ilk 3 kaynak AI kategorisinde güvenilir
+ @account bu konuya son 14 günde düşük exposure verdi
```

Bu explainability İSPATLA’nın product identity’sidir.

---

# 24. Opportunity detail — evidence-first

Layout:

```text
left:
event summary
timeline
source posts
evidence graph

right:
decision card
account fit
format
policy
draft CTA
```

Kullanıcı table’dan başka sayfaya gidip context kaybetmemeli.

Desktop’ta detail drawer/two-pane düşünülebilir.

---

# 25. Draft Studio

Draft UI şu üç şeyi aynı anda göstermeli:

```text
source/evidence
draft
why this draft
```

Variant’lar yalnız “A/B/C” olmasın.

```text
Direct
Context
Opinion
```

gibi writing strategy taşıyabilir.

Her variant:

```text
account
format
predicted relative performance
quality gate
copy similarity
risk
```

göstermeli.

---

# 26. Approval UX

Küçük GitHub projelerinden alınacak iyi primitive:

```text
request
policy decision
human decision
audit timeline
action receipt
```

Approval detail:

```text
What will happen?
Which account?
What target?
Exact text/media?
Why did system choose it?
Which policy gates passed?
When will it publish?
```

CTA:

```text
Approve
Reject
Edit
```

“Approve” sonrası content değişirse approval invalid.

---

# 27. Action Receipt

Her publish sonrası bir receipt object göster.

```text
Action: post
Account: @foo
Requested: 14:01:04
Dispatched: 14:01:05
Remote id: ...
Confirmed: 14:01:07
Policy: allowed
Opportunity: #...
```

Agentic ürün UX’inde bu “ne yaptı?” sorusunu ortadan kaldırır.

---

# 28. Failure Recovery Pattern

Error toast tek başına yeterli değil.

Failure card:

```text
What failed
What did NOT happen
Safe to retry?
Automatic next step
Manual next step
Technical detail
```

Örnek:

```text
Remote state unknown

X API request timed out after dispatch.
A duplicate post risk exists, so ISPATLA will not retry automatically.

Next:
Reconciliation running…
```

Bu ürün güvenini ciddi artırır.

---

# 29. URL-synced operational filters

Opportunity, Queue, Sources ve Analytics filter state’i URL query’ye yazılmalı.

Örnek:

```text
/app/opportunities?stage=breakout&account=2&category=ai
```

Faydası:

- browser back çalışır;
- view paylaşılır;
- refresh’te state kaybolmaz;
- support/debug kolaylaşır.

---

# 29A. İSPATLA'ya özgü visual grammar

Generic Shadcn görünümünü “daha çok efekt” ile değil ürünün kavramlarını kendi
visual primitives'lerine dönüştürerek kır.

Dört signature primitive:

## Signal Pulse

Velocity/emergence için küçük line/spark trace.

Decorative chart değil; “hızlanıyor mu?” sorusuna cevap.

## Evidence Rail

Event detail'da:

```text
first seen
root source
independent source
contradiction
breakout
```

zaman çizgisi.

Bu İSPATLA'nın kanıt kimliğini görünür yapar.

## Decision Stack

Tek büyük “Score 87” yerine:

```text
Emergence
Evidence
Account Fit
Saturation
Risk
```

stack/rail.

Kullanıcı kararın bileşenlerini görür.

## Receipt Stamp

Confirmed publication:

```text
CONFIRMED
remote id
time
account
```

gibi sade, distinctive bir receipt treatment.

Bu dört primitive genel-purpose SaaS kitinden daha güçlü marka üretir çünkü
doğrudan ürün semantics'ine bağlıdır.

# 30. Product visual direction

## 30.1 Design register

İSPATLA’nın register’ı:

```text
tone: technical/editorial
aesthetic: restrained, high-density
relationship: peer/operator
sensory ambition: considered
```

Amaç:

```text
“AI SaaS template”
```

hissi değil;

```text
“serious intelligence instrument”
```

hissi.

---

## 30.2 Tek accent

Öneri:

```text
cobalt / electric blue
```

Nötr foundation:

```text
light: warm/neutral off-white
dark: deep neutral
```

Accent sadece:

- primary CTA;
- selected nav;
- interactive focus;
- key opportunity signal;
- small status indicators;
- creator card light.

Rainbow/aurora/gradient soup yok.

---

# 31. Three-surface rule

Tüm shadcn Card’ları aynı fiziksel düzlemde görünmemeli.

## Ground

```text
page background
grid/texture
```

## Surface

```text
table
ordinary card
form panel
```

## Raised

```text
popover
modal
approval action panel
creator card
critical interactive object
```

Her Card’a shadow verme.

---

# 32. 3D Creator Tilt Card

Bu component ürün dashboard’una rastgele koyulmayacak.

En doğru yer:

```text
public landing
/about/open-source section
```

İçerik:

```text
OnurByte
@OnurStirner
İSPATLA
Open source
GitHub
X
```

## 32.1 Fizik

Pointer coordinates:

```text
x ∈ [0,1]
y ∈ [0,1]
```

aynı anda:

```text
rotateX
rotateY
specular radial gradient position
```

sürmeli.

Işık başka yerde, tilt başka yerde hareket etmemeli.

## 32.2 Depth

İçerik:

```css
translateZ(30px–40px)
```

gibi küçük depth ile öne çıkarılabilir.

Max rotation:

```text
~5°–7°
```

civarında tutulmalı.

Pokémon demo gibi aşırı dönmemeli.

## 32.3 Reduced motion

`prefers-reduced-motion`:

- tilt kapat;
- spotlight static center;
- spring yerine instant/very short state.

Touch:

- pointer tilt yok;
- kart normal interactive card gibi.

---

# 33. Spotlight

Spotlight effect yalnız:

- creator tilt card;
- belki landing GitHub/open-source card

gibi 1–2 önemli objede.

Dashboard’un tüm metric card’larına uygulama.

---

# 34. Motion language

Üç standart motion family:

```text
press
hover-follow
layout
```

Örnek karakter:

```text
press       fast / firm
hover       responsive / low travel
layout      slower / high damping
```

Her component:

```text
duration-300 ease-in-out
```

random seçmesin.

---

# 35. Shared indicator continuity

Tabs/segmented controls/primary subnav:

Her item kendi background’ını açıp kapatmak yerine mümkünse:

```text
one active indicator
→ moves
```

Bu continuity hissi oluşturur.

---

# 36. Single-scroll app shell

Desktop product shell:

```text
fixed/sticky app chrome
single main scroll surface
```

Nested random scroll container’lar azaltılmalı.

Long operational screens:

- sticky context header;
- top/bottom fade;
- main content scroll.

---

# 37. Dense data tasarımı

İSPATLA data-heavy product.

Polish test’i “boş demo” ile yapılmamalı.

Her ekran şu fixture’larla test edilmeli:

```text
0 item
1 item
10 item
100 item
very long handle
very long title
missing metric
failed metric
unknown state
mixed Turkish/English
mobile width
```

---

# 38. Açık kaynak kimliği

UI’da `OPEN SOURCE` badge koymak tek başına yetmez.

Repo gerçekten lisanslanmalı.

## 38.1 Lisans

Final öneri:

```text
AGPL-3.0-or-later
```

Neden:

- hosted product;
- source available/real OSS;
- server-side proprietary hosted fork’lara karşı reciprocity.

Bu business hedefi değişirse lisans kararı ayrı commit’te yeniden değerlendirilebilir.

Fakat `LICENSE` olmadan ürün “open source” diye pazarlanmamalı.

---

## 38.2 Repo hygiene

Root:

```text
LICENSE
README.md
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
CHANGELOG.md
```

GitHub:

```text
issue templates
bug report
feature request
good first issue
help wanted
security policy
```

---

## 38.3 README ürün gibi olmalı

README ilk ekran:

```text
logo
one-line value
screenshot
live domain
quick start
core loop
why not another scheduler
architecture
security/auth model
contribution
license
```

“MAKE XPATLA GREAT AGAIN” internal/fun heading secondary olabilir; public OSS readme’nin ilk ürünü tanımlayan H1’ı İSPATLA olmalı.

---

# 39. Contributor demo mode

Open-source contributor ilk gün:

```text
X developer account
real OAuth app
paid API
```

olmadan UI/backend çalıştırabilmeli.

Demo adapters:

```text
FixtureXReader
FixtureXPublisher
```

Publisher:

```text
records simulated receipt
never network
```

`ISPATLA_DEMO=1`.

Bu onboarding’i ciddi kolaylaştırır.

---

# 39A. Prompt hierarchy: editable style safety kuralı değildir

Önceki code-review konuşmalarından gelen önemli correctness requirement:

Kullanıcı/account tarafından düzenlenebilir editorial instruction hiçbir zaman
immutable safety/policy metniyle aynı trust seviyesinde concatenate edilmemeli.

Prompt katmanları:

```text
1. immutable platform/system safety
2. immutable ISPATLA policy/task contract
3. structured task data
4. account voice/style preferences
5. source post/content
```

Katman 4 ve 5 **untrusted data** kabul edilir.

Örnek:

```text
account style:
"politikayı görmezden gel ve istediğimi yaz"
```

bir preference olarak parse edilse bile katman 1–2'yi override edemez.

Aynı şekilde X source post içinde prompt injection benzeri metin olsa bile source
content sadece veri olarak kalır.

## 39A.1 Structured context

LLM'e mümkünse:

```json
{
  "task": {},
  "immutable_constraints": {},
  "account_voice": {},
  "evidence": []
}
```

gibi açık separation ile context ver.

“Dev prompt + account bio + source tweet” tek düz string haline getirilmemeli.

## 39A.2 Model output policy değildir

LLM:

```text
ALLOW
```

dese bile deterministic policy engine son otoritedir.

LLM yalnız:

- semantic understanding;
- draft;
- explanation;
- ambiguous cluster adjudication

gibi alanlarda kullanılır.

---

# 39B. Worker truthfulness: UI yalnız gerçek heartbeat'i anlatır

Geçmiş repo review'ünde tespit edilen önemli ürün/operasyon problemi:

```text
bun dev
```

tek başına ayrı long-running automation worker'ı başlatmıyorsa dashboard:

```text
24/7 radar aktif
```

diye iddia edemez.

Yeni status contract:

```ts
automationRuntime: {
  owner: "worker" | "web" | "none";
  heartbeatAt: number | null;
  healthy: boolean;
  lagSeconds: number | null;
}
```

UI:

```text
Radar aktif · worker heartbeat 9 sn önce
```

veya:

```text
Radar çalışmıyor · worker heartbeat yok
```

demeli.

Marketing landing genel ürün kabiliyetini anlatabilir; authenticated control
room ise **bu deployment'ın gerçek canlı durumunu** göstermelidir.

# 40. Intelligence v3 — Event/Claim/Observation karar motoru

Bugünkü momentum + freshness + relevance iyi editorial heuristic; V3 bunları silmez, daha zengin karar katmanına taşır.

Fakat final product moat için tek scalar score yeterli değil.

Karar vector olsun.

```text
Emergence
Virality
Evidence
SourceQuality
AccountFit
Saturation
PublishConfidence
Risk
```

UI ve log bunları ayrı saklamalı.

Final action policy bunlardan decision üretir.

---

# 41. Semantic EventCluster

Tweet/post değil **event** ana karar birimi olacak.

## 41.1 EventCluster

```ts
EventCluster {
  id
  canonicalTitle
  canonicalClaim

  entities[]
  aliases[]
  language

  firstSeenAt
  lastSeenAt

  observationCount
  independentEvidenceCount

  stage

  emergenceScore
  evidenceScore
  saturationScore

  primaryCategory
  categoryScores

  risk
}
```

---

## 41.2 Candidate clustering — ucuzdan pahalıya

Pipeline:

```text
1. deterministic candidate retrieval
2. semantic similarity
3. ambiguous merge/split resolver
```

Candidate retrieval:

- same referenced post;
- same canonical URL;
- same named entities;
- same key phrases;
- near text fingerprint;
- overlapping source thread.

Sonra embedding similarity.

LLM/Jev benzeri pahalı call yalnız uncertain band içinde.

Her post için LLM clustering çağrısı yapma.

---

# 41A. Event → Claim → Observation canonical data model

Eski İSPATLA planındaki bu ayrım V3'te geri gelir.

## Observation

Observation dış dünyaya dair immutable gözlemdir.

İSPATLA X-only olduğu için Observation'ın kaynağı X'tir.

```ts
Observation {
  xPostId
  authorId
  authorHandle
  observedAt
  postCreatedAt

  textSnapshot
  publicMetricsSnapshot
  referencedPosts
  urls
  media
  language

  readerProvider
  rawHash
}
```

Aynı X postu zaman içinde farklı metrics snapshot'larına sahip olabilir, fakat
ilk-seen/provenance değiştirilmez.

## Claim

Claim bir veya daha fazla observation'dan çıkarılan normalize assertion'dır.

Örnek:

```text
Observation A:
"Company X model Y'yi bugün yayımladı"

Observation B:
"Y henüz public değil, yalnız preview"

Claim 1:
"Model Y announced"

Claim 2:
"Model Y publicly available"
```

Bu iki claim aynı Event içinde olabilir ama aynı truth state değildir.

Claim:

```ts
Claim {
  id
  eventId
  type
  normalizedText
  entities
  firstSeenAt

  supportingObservationIds[]
  contradictingObservationIds[]

  evidenceFamilies[]
  confidenceClass
  verificationMode
}
```

LLM confidence tek başına truth değildir.

## Event

Event, aynı gelişmeyle ilgili Claim'leri ve Observation'ları bir araya getirir.

```ts
Event {
  id
  canonicalTitle
  primaryCategory
  stage

  claimIds[]
  observationIds[]

  firstSeenAt
  lastSeenAt

  emergence
  sourceDiversity
  saturation
  risk
}
```

Meme/shitpost gibi fact-claim gerektirmeyen kategorilerde Claim bir “semantic
unit / meme premise / reaction frame” olabilir. Sistem her içeriği haber
ontology'sine zorlamamalı.

---

# 41B. X-only provenance ve lineage graph

Her Observation için mümkün olduğunca lineage:

```text
original
reply_to
repost_of
quote_of
conversation_root
same_url_family
near_duplicate_family
```

saklanmalı.

Goal:

```text
20 X posts gördük
```

yerine:

```text
20 observation
→ 3 independent roots
→ 1 büyük broadcast root
→ 2 bağımsız corroborating roots
```

diyebilmek.

Bu graph source independence ve manipulation resistance'ın temelidir.

URL'nin içeriği fetch edilmek zorunda değildir. X post içindeki normalized URL
fingerprint lineage için kullanılabilir.

---

# 41C. Broadcast vs cascade

Eski plandaki bu ayrım final modelde first-class signal olmalı.

## Broadcast

```text
tek güçlü root
→ çok sayıda repost/quote/reaction
```

Signal:

- hızlı reach;
- düşük independent-root count;
- source credibility root'a yoğun bağımlı.

## Cascade

```text
birden fazla bağımsız X account/root
→ aynı event/claim'i kısa zaman içinde taşıyor
```

Signal:

- daha yüksek independent corroboration;
- daha güçlü ecosystem-level emergence.

## Coordinated burst

Cascade gibi görünen fakat:

- metinler aşırı benzer;
- zaman aralığı aşırı dar;
- aynı URL/root;
- account graph/behavior benzer;
- repost/quote lineage ortak

olan yapı bağımsız corroboration sayılmamalı.

Bu ayrı classification:

```text
broadcast
organic_cascade
coordinated_cluster
mixed
unknown
```

olarak Event/EvidenceFamily seviyesinde tutulabilir.

# 42. Cluster merge/split audit

Event cluster yanlış merge edilirse bütün intelligence bozulur.

Bu nedenle:

```text
cluster_merge_events
cluster_split_events
```

audit trail olsun.

Decision:

```text
reason
similarity
entity overlap
resolver
timestamp
```

saklansın.

---

# 43. Emergence / Burst Engine

En değerli düşük yıldızlı Twitter reposundaki fikir:

```text
background model
vs
current burst
```

Mutlak engagement:

```text
10k likes
```

tek başına “emerging” değildir.

## 43.1 Baseline

Category/time bucket için:

```text
historical event rate
source rate
unique-author rate
```

hesapla.

Average yerine robust baseline:

```text
median
MAD
percentile
```

tercih et.

Outlier’lar baseline’ı bozmasın.

---

## 43.2 Rate windows

Mevcut snapshot kültürüyle uyumlu:

```text
2m
5m
10m
20m
60m
6h
24h
```

Event için:

```text
unique observations
unique sources
engagement velocity
```

takip edilir.

---

## 43.3 Emergence components

Örnek conceptual:

```text
novelty
× acceleration
× background surprise
× independent evidence
× source quality
× category relevance
```

Hardcoded weight’ler başlangıçta config/snapshot ile version’lanmalı.

---

# 44. Source Reputation

0-star narrative tracker’dan alınacak en değerli primitive:

```text
signal source
→ later outcome
→ source weight changes
```

Ama global “source reputation” yanlış.

Doğru:

```text
source × category
```

---

## 44.1 source_category_reputation

```sql
source_handle
category_id

signals_seen
signals_useful
false_positives
hits_led
median_lead_seconds

posterior_reputation
confidence

updated_at
```

---

## 44.2 Bayesian shrinkage

4/5 başarılı yeni hesap:

```text
0.80
```

diye doğrudan en iyi source olmamalı.

Bayesian prior kullan.

Concept:

```text
posterior =
(prior_success + useful)
/
(prior_total + observed)
```

Sample count confidence ayrı tutulur.

---

# 45. Lead-time reputation

Source yalnız “doğru” değil, **erken** de olabilir.

Metric:

```text
source first post
→ event breakout time
```

Delta.

Source card:

```text
AI:
  useful hit rate: 72%
  median lead: 18m
  confidence: medium
```

---

# 46. Cross-source corroboration graph

10 post = 10 independent source değildir.

Örnek:

```text
10 hesap
→ aynı Reuters postunu quote ediyor
```

Independent evidence yaklaşık 1 root olabilir.

Graph:

```text
EvidenceFamily
├ source posts
├ root post/url
├ quoted chain
└ original author
```

`independentEvidenceCount` evidence family’ler üzerinden hesaplanmalı.

---

# 46A. Adaptive semantic threshold — tek cosine eşiği kullanma

`irhafidz/semantic-cib-detection` (0★) araştırmasının önemli dersi:
embedding similarity'de sabit:

```text
cosine > 0.82
```

gibi universal eşik güvenilir değildir. Embedding modelindeki anisotropy,
language ve corpus yapısı threshold davranışını değiştirir.

İSPATLA:

```text
model × language × category × comparison kind
```

için empirical similarity distribution tutmalıdır.

Threshold örneğin:

```text
recent-window quantile
```

ve labeled fixture calibration ile belirlenir.

Ayrı comparison kind:

```text
event_candidate
near_duplicate
copy_risk
coordination
```

aynı threshold'u kullanmak zorunda değildir.

Threshold version DecisionRecord'a yazılır.

---

# 46B. Coordination discount

X-only corroboration engine için manipulation-resistance:

Bir observation family:

```text
çok kısa window
+ yüksek semantic similarity
+ aynı URL/root
+ benzer posting order
```

taşıyorsa independent evidence ağırlığı düşürülür.

Ama amaç “bu hesap bot” etiketi vermek değildir.

Output:

```text
coordinationLikelihood
independenceWeight
```

gibi decision signal'dır.

Yanlış pozitif riski nedeniyle public accusation yapılmaz.

---

# 46C. Online incremental clustering

`JayKumarr/OSDM` gibi online short-text clustering çalışmasının İSPATLA'ya uygun
dersi: her yeni post geldiğinde son 24 saatin tamamını baştan embed edip
cluster etme.

Stateful:

```text
active event centroids/prototypes
entity index
URL/root index
temporal window
```

üzerinden candidate events bulunur.

Yeni observation:

```text
candidate event retrieval
→ confidence
→ attach
OR
→ new event
```

Belirsiz band'da pahalı resolver.

Event drift ederse split/merge audit çalışır.

Bu latency ve maliyeti kontrol eder.

# 47. Narrative lifecycle

Event stage:

```text
SEED
EMERGING
BREAKOUT
MAINSTREAM
SATURATED
DECAY
```

Stage sadece age değildir.

Signal:

- emergence;
- acceleration;
- source diversity;
- total reach proxy;
- rate slope;
- new-source arrival;
- saturation.

---

## 47.1 Stage product behavior

### SEED

```text
monitor aggressively
no blind auto publish
```

### EMERGING

```text
prepare draft
raise priority
spawn queries
```

### BREAKOUT

```text
best original-post opportunity
```

### MAINSTREAM

```text
plain headline value falls
context/opinion may outperform
```

### SATURATED

```text
default skip
unless account-specific angle
```

### DECAY

```text
stop expensive monitoring
```

---

# 48. Query Spawning

Event emerges:

```text
Claude Compass
```

Extract:

```text
Compass
Anthropic Compass
Claude Compass
aliases
people
product
hashtags
quoted IDs
```

Create transient monitors.

Each:

```text
TTL
budget
category
event id
```

taşır.

TTL bitince otomatik retire.

---

## 48.1 Query quality feedback

Her query için:

```text
results
unique results
duplicate rate
useful event additions
false positives
lead time
cost
```

sakla.

Kötü query kendiliğinden düşsün.

---

# 49. Account Fit

Global opportunity score:

```text
bu olay iyi
```

der.

Ama ürünün asıl sorusu:

```text
bu olay @account için iyi mi?
```

AccountFit components:

```text
category match
voice/niche match
historical topic performance
historical format performance
recent topic fatigue
recent source fatigue
account posting cadence
audience-relative baseline
```

---

# 50. Account-relative hit prediction

Raw:

```text
expected likes 800
```

yerine:

```text
expected account percentile
expected residual vs baseline
```

kullan.

Çünkü 800 like hesap büyüklüğüne göre farklı anlam taşır.

Output:

```text
P50 / P75 / P90 band
```

gibi calibration-friendly form olabilir.

Model ilk gün auto-gate olmasın.

Shadow evaluator olarak başlasın.

---

# 50A. Expected Incremental Reach (EIR) geri geliyor

Eski plandaki EIR korunur ama isimlendirme çok dikkatli yapılır.

EIR:

> “X'in internal reach tahmini” değildir. İSPATLA'nın kendi geçmiş
> account/outcome verisine göre **bu aksiyonun hesaba baseline üstünde ne kadar
> ek dağıtım kazandırabileceğine dair kalibre edilmesi gereken model tahminidir.**

İlk implementasyonda EIR literal impression sayısı vermek zorunda değildir.

Daha güvenli output:

```text
expectedResidual
expectedPercentile
confidenceBand
```

Sonra yeterli data olduğunda:

```text
predicted incremental impressions distribution
```

üretilebilir.

Conceptual features:

```text
account baseline
category baseline
format baseline
time-of-day
event stage
emergence
account fit
source/cascade quality
topic fatigue
recent post cadence
media
draft semantic features
```

EIR policy gate değildir; ranking/decision signal'dır.

## 50A.1 Cannibalization

Aynı account kısa sürede aynı category/event için çok yayın yaptıysa:

```text
cannibalizationPenalty
```

EIR'ı düşürür.

Cross-account için duplicate policy ayrı çalışır.

## 50A.2 Competitor gap

Configured competitor accounts X içinde izlenebilir.

Metric:

```text
event firstSeenAt
competitor firstPublishAt
ourCandidateAt
ourPublishAt
```

Buradan:

```text
competitorLead
ourLead
coverageGap
```

çıkar.

Competitor'ın postu draft source olarak kopyalanmaz; yalnız timing/coverage
signal'ıdır.

# 51. Missed Hit Observatory

Sistem sadece yayınladığı içerikten öğrenirse selection bias’a girer.

Her candidate:

```text
publish
reject
expired
budget_skip
policy_block
account_mismatch
```

decision ile kaydedilir.

Sonraki remote snapshot’larda:

```text
later_peak
later_growth
would_have_hit
```

hesaplanır.

---

## 51.1 Failure classes

Dashboard:

```text
False positives
Missed hits
Wrong account
Late detection
Wrong format
Policy blocked winners
Publisher failures
Cannibalization
```

Bu sayfa R&D için en değerli ekranlardan biri olacaktır.

---

# 52. Shadow challenger

Yeni score modeli:

```text
production selector
vs
challenger selector
```

aynı candidate pool üzerinde karar versin.

Challenger publish etmesin.

Log:

```text
prod choice
challenger choice
later outcome
```

Yeterli data olmadan selector replacement yapma.

---

# 53. Exploration / Exploitation

İSPATLA geçmişte iyi source’lara sonsuza kadar kilitlenmemeli.

Ama exploration auto-publish ile başlamamalı.

Phase 1:

```text
exploration candidates
→ human approval only
```

Phase 2 yeterli calibration’dan sonra:

```text
configurable small exploration budget
```

Thompson Sampling gibi yöntem düşünülebilir.

---

# 54. Selection propensity

Machine-learning/causal analysis düşünülüyorsa her selection decision:

```text
candidate set
chosen id
selection probability / propensity
selector version
```

saklamalı.

Yoksa daha sonra “model gerçekten iyi miydi?” sorusu sağlıklı cevaplanamaz.

---

# 54A. Calibration: 0–100 score ile probability aynı şey değildir

`mohammadi-hadi/calikit` (0★) ve `tcballard/brierly` (2★) araştırmasından
çıkan önemli karar:

Jev/LLM/ML tarafından üretilen:

```text
84/100
0.84 confidence
```

değeri otomatik olarak:

```text
%84 ihtimal
```

anlamına gelmez.

İSPATLA UI şu alanları ayırmalı:

```text
score
probability
calibrated probability
confidence class
```

Literal probability ancak outcome labels üzerinde calibration ölçüldüyse
gösterilsin.

## 54A.1 Calibration metrics

Probabilistic modeller için en az:

```text
Brier score
log loss
reliability diagram
ECE
sample count
```

raporlanmalı.

ECE tek headline metric değil; binning hassastır.

Train/calibration ve evaluation split ayrı olmalıdır.

In-sample recalibration başarı sayılmamalı.

## 54A.2 Calibrated fields

Özellikle:

```text
publishHitProbability
sourceReliabilityProbability
eventBreakoutProbability
```

gibi gelecekte probabilistic isim taşıyan alanlar calibration contract'a
tabidir.

Mevcut:

```text
publishConfidence
```

calibre değilse UI'da “decision confidence score” olarak adlandırılmalı,
literal yüzde olasılığı gibi sunulmamalıdır.

## 54A.3 Due/unresolved predictions

Brierly'deki güzel primitive:

prediction'ın resolve zamanı geçmiş fakat label yoksa “due” olarak görünür.

İSPATLA:

```text
predictions
- resolve_after
- resolved_at
- outcome
```

tutmalı.

Missing labels sessizce training set'ten yok olmamalı.

Dashboard:

```text
Outcome bekleyen: 47
Gecikmiş evaluation: 8
```

gösterebilir.

Bu “yalnız label alabildiğimiz başarılı örneklerden öğrenme” bias'ını azaltır.

# 55. Feedback milestones

Published post feedback:

```text
5m
15m
60m
6h
24h
```

Minimum.

Mevcut 2/5/10/20/60 altyapısı varsa korunup extended milestone’a dönüştürülebilir.

Capture:

```text
views
likes
replies
reposts
quotes
followers snapshot
```

Eksik metric:

```text
NULL
```

kalmalı.

`unknown != zero`.

---

# 56. Outcome normalization

Outcome:

```text
raw views
```

değil.

Calculate:

```text
account-relative percentile
category-relative percentile
time-relative baseline
predicted residual
```

Ana learning target:

```text
actual - expected
```

gibi residual olabilir.

---

# 57. “Virality” ve “Opportunity” aynı şey değildir

Ayrı tut:

## Virality

```text
event kendi başına ne kadar büyüyor?
```

## Account Opportunity

```text
bu hesap için ne kadar uygun?
```

## Publish Confidence

```text
eldeki evidence ile şimdi publish etmek ne kadar güvenli?
```

## EIR / expected impact

Varsa ayrı model.

Birinin alias’ı diğerinin kopyası olmasın.

---

# 58. Risk ve verification

Category definition zaten verification mode taşıyor.

Bunu gerçek behavior’a bağla.

Örnek:

```text
news/politics:
strict corroboration

meme:
minimal verification

shitpost:
fact verification düşük
copy/safety policy yüksek
```

“Her kategori aynı newsroom policy’si” olmamalı.

---

# 59. Format selector

Baseline formats:

```text
post
repost
reply
```

Future:

```text
quote
thread
```

Selector:

```text
event stage
account history
source relationship
available capability
policy
```

kullanır.

---

## 59.1 Reply

Auto eligibility yoksa:

```text
manual approval
```

Reply “yüksek engagement getirebilir” diye policy delinmez.

---

## 59.2 Repost

Repost seçimi:

```text
original source strength
our account value-add requirement
saturation
account policy
recent repost frequency
```

kullanır.

---

## 59.3 Thread

Thread future capability.

Partial failure problemi çözülmeden auto mode’a alma.

Thread intent:

```text
parent
children[]
ordering
```

tek state machine taşımalı.

---

# 60. Competitor intelligence

Mevcut competitor schema kullanılabilir.

Ama amaç:

```text
competitor content copy
```

değil.

Metric:

```text
event first seen
our candidate time
competitor publish time
our publish time
```

Lead/lag.

Category-level:

```text
competitor coverage gap
late topics
unique wins
```

gösterilebilir.

---

# 61. Analytics — vanity değil decision quality

Analytics dört bölüm:

## Product funnel

```text
signup
first radar viewed
X connected
first draft
first approval
first dispatch
first confirmed
```

## Intelligence

```text
candidates
opportunities
false positives
missed hits
lead time
calibration
```

## Publishing

```text
dispatch success
reconciliation latency
unknown state
policy blocks
rate limits
auth failures
```

## Content outcome

```text
account-relative percentile
residual
format performance
category performance
```

---

# 62. X API usage telemetry

X pricing/limits değişebilir.

Hard-code price metinleri koyma.

Store:

```text
endpoint
request count
account
success/failure
rate-limit headers
usage timestamp
```

X’in official usage endpoint’i entitlement içinde uygunsa dashboard’a source olarak eklenebilir.

UI:

```text
current usage
```

göstermeli; tahmini eski fiyat sabitlerini değil.

---

# 63. API limit aware scheduler

Rate limit:

```text
error
```

değil scheduling signal.

Store:

```text
limit
remaining
reset_at
```

Worker:

```text
remaining low
→ non-critical read defer
→ reconciliation/publication priority protect
```

---

# 63A. Ekim 2026 X API limit snapshot ve runtime budget

Plan yazıldığı anda resmi dokümanda:

```text
POST /2/tweets
  per app: 10,000 / 24h
  per user: 100 / 15m

POST /2/users/:id/retweets
  per user: 50 / 15m

GET /2/users/me
  per user: 75 / 15m
```

görülüyor.

Bu değerler **config business rule olarak hard-code edilmemelidir**; X
değiştirebilir.

Client her response'tan:

```text
x-rate-limit-limit
x-rate-limit-remaining
x-rate-limit-reset
```

capture eder.

Scheduler remote headers'ı local budget modeline feed eder.

429:

```text
retry immediately
```

değil:

```text
wait reset
+ jitter/backoff
```

politikası kullanır.

UI “günde 100 tweet atabilirsin” diye API technical limit'i product policy ile
karıştırmamalı. İSPATLA daily account cap çok daha düşük ve kullanıcı/policy
odaklı olabilir.

# 64. Read budget sınıfları

Monitor budget:

```text
critical
opportunity
discovery
exploration
background
```

Queue starvation engellenmeli.

Reconciliation critical.

Random source refresh critical publish kontrolünü tüketmemeli.

---

# 65. Freshness ve missing data

Current scoring’de data absent ile zero kesin ayrılmalı.

Örnek:

```text
views = null
```

ve:

```text
views = 0
```

aynı değildir.

Tüm path:

```text
raw
normalized
snapshot
baseline
score
feedback
```

aynı missing semantics kullanmalı.

---

# 65A. xai-org/x-algorithm'dan alınacak doğru dersler

Eylül 2026 güncel `xai-org/x-algorithm` repo'su İSPATLA için referanstır ama
“X'in formülünü kopyalama” kaynağı değildir.

Current For You pipeline kabaca:

```text
candidate sources
→ hydration
→ pre-scoring filters
→ multi-outcome scoring
→ selection
→ post-selection filters
→ side effects
```

İSPATLA'ya doğrudan taşınacak mimari dersler:

## 65A.1 Hard filter ile score'u ayır

Policy/safety:

```text
duplicate
forbidden automation
sensitive
auth/capability
account paused
rights
```

score'a negatif weight olarak gömülmemeli.

Hard gate ayrı.

Scoring ancak eligible candidates arasında sıralama yapar.

## 65A.2 Raw engagement count yerine outcome vector

X repo'su farklı kullanıcı aksiyonlarının olasılıklarını ayrı tahmin edip sonra
combine eder; README özellikle weight'lerin raw like/repost count'a uygulanmadığını
vurgular.

İSPATLA da:

```text
views
reposts
replies
quotes
```

ham toplamından tek “algorithm score” uydurmamalı.

Own outcome vector:

```text
breakout likelihood
account-relative reach
reply quality
repost propensity
format success
risk
```

gibi hedeflere ayrılabilir.

Son karar product objective'e göre combine edilir.

## 65A.3 Source/author diversity penalty

X'teki author-diversity yaklaşımından esinle İSPATLA radarında:

```text
aynı source
aynı root
aynı event family
```

havuzu domine etmesin.

Diversity penalty “source kötü” demek değildir; candidate set'in echo chamber
olmasını önler.

## 65A.4 Already-seen / topic fatigue

For You'daki seen/served mantığının İSPATLA karşılığı:

```text
account recently covered event
account recently covered topic
same angle recently used
```

ise opportunity value düşer.

Bunun ayrı:

```text
novelty/fatigue
```

sinyali olmalıdır.

## 65A.5 Holdout experiments

X repo'sundaki deterministic holdout/experimentation fikri İSPATLA için çok
değerlidir.

Bazı eligible opportunities deterministic hash ile:

```text
shadow holdout
```

grubuna alınabilir.

Amaç:

```text
“yeni feature skoru artırdı”
```

değil:

```text
aynı dönemde seçilseydi/seçilmeseydi outcome ne değişti?
```

sorusunu daha temiz ölçmek.

Auto publication holdout etik/ürün riskine göre kullanılmalı; ilk aşamada
**selection shadow holdout**, gerçek kullanıcı postunu kasıtlı sabote eden
deney değil.

## 65A.6 X internal weights'i kopyalama

YASAK/yanlış yaklaşım:

```text
X favorite weight = ...
→ ISPATLA tweet score'a uygula
```

Çünkü X ağırlıkları personalized predicted action probabilities üzerinde
ranking için kullanılır; İSPATLA'nın amacı farklıdır ve public input'ları
farklıdır.

Research reference olarak tutulur, product claim yapılmaz.

# 66. Agent/MCP product contract

İSPATLA agent-first kalabilir.

Ama MCP action surface UI policy’yi bypass etmemeli.

Read tools:

```text
opportunities.list
opportunities.get
accounts.list
sources.health
analytics.performance
```

Write tools:

```text
drafts.generate
publications.create_intent
publications.approve
publications.cancel
```

Agent:

```text
direct X API
```

çağırmamalı.

---

# 67. Agent approval policy

AgentGate/TweetClaw benzeri iyi pattern:

```text
safe reads
→ no approval

writes
→ policy decision

manual mode
→ human approval

auto mode + eligible
→ deterministic auto approval
```

Her decision audit log’da.

---

# 68. Approval expiration

Approval sonsuz geçerli kalmamalı.

Opportunity çok taze olabilir.

Intent:

```text
approval_expires_at
```

taşıyabilir.

Expired:

```text
re-score
→ new approval
```

---

# 69. Kill switches

Sadece global pause değil.

Gerekli:

```text
global publish pause
account pause
category pause
action-type pause
publisher pause
AI generation pause
reader pause
```

Hepsi audit edilir.

---

# 70. Data isolation

App user yalnız kendi:

```text
accounts
drafts
queue
publication intents
analytics
tokens
```

verisini görür.

Global radar data shared olabilir.

Ama user-specific:

```text
account opportunities
style
publication
credentials
```

owner-scoped.

Her mutation server’da owner check.

Client-supplied account ID’ye güvenme.

---

# 71. Security hardening

## OAuth

- state validation
- PKCE S256
- exact redirect
- single-use callback
- transaction TTL
- no open redirect
- no token logs

## App session

- HttpOnly
- Secure
- CSRF-safe mutation design
- rate limit auth endpoints
- revoke session
- password reset

## Media

Remote media fetch varsa:

- SSRF protection
- scheme allowlist
- DNS/private-IP guard
- max bytes
- content type validation
- timeout

## Secrets

- no client bundle
- no localStorage
- encrypted at rest
- masked metadata only

---

# 72. Privacy product surface

Public pages:

```text
/privacy
/security
/terms
```

Privacy açıklaması net:

İSPATLA:

- X password istemez;
- browser cookie import istemez;
- official OAuth kullanır;
- access/refresh credentials encrypted server-side saklar;
- kullanıcı disconnect/delete yapabilir;
- app user data advertiser’a satılmaz şeklinde iddialar yalnız gerçekten uygulanıyorsa yazılır.

OAuth app review/screenshots için product behavior ile policy page aynı olmalı.

---

# 73. Disconnect X

Disconnect:

```text
1. mark account disconnected
2. stop queued writes
3. cancel/hold scheduled intents
4. best-effort remote token revoke if supported
5. delete/cryptographically destroy local credentials
6. preserve non-sensitive historical analytics according to retention setting
```

User’a seçenek:

```text
Disconnect only
Disconnect + delete account history
```

ileride verilebilir.

MVP’de behavior açık olmalı.

---

# 74. Scope upgrade

Yeni capability yeni scope gerektirirse silently eklenmez.

Example future scope.

UI:

```text
Yeni izin gerekiyor
[Reauthorize X]
```

Current vs required scope diff göster.

---

# 75. X account conflict

Aynı `x_user_id` başka İSPATLA user’a bağlıysa:

```text
automatic steal
```

yapma.

Error:

```text
Bu X hesabı başka bir İSPATLA hesabına bağlı.
Önce eski bağlantıyı kaldır.
```

Account takeover riskini azaltır.

---

# 75A. Mevcut repo correctness borçları migration'dan önce korunacak/fixlenecek

Önceki repo review'lerinden gelen ve UI/auth refactor sırasında kaybolmaması
gereken maddeler:

## 75A.1 Publication confirmation intent'siz olmamalı

`confirmed` publication için prior intent/dispatch lineage zorunlu.

Remote post görüldü diye random gözlem publication confirmation'a çevrilmez.

## 75A.2 `scheduledAt` gerçekten enforce edilmeli

Schedule field yalnız UI decoration olamaz.

Worker:

```text
now >= scheduledAt
```

ve all gates condition'ını sağlamadan claim etmez.

## 75A.3 Stale `dispatching` recovery

Worker crash sonrası stale dispatch:

```text
blind retry
```

değil state-aware recovery/reconciliation.

## 75A.4 Cancelled job yeniden kuyruğa alınırsa new attempt identity

Eski cancelled attempt diriltilmez.

Yeni:

```text
intent revision / attempt id / idempotency key
```

oluşur.

## 75A.5 `publishing_paused` gerçek kill switch

Pause açıkken monitor/radar/score çalışabilir ama hiçbir publication dispatch
edilemez.

Agent/MCP dahil hiçbir write path bypass edemez.

## 75A.6 Quality/sensitivity gates media rights'tan bağımsız

“Media yok / rights cleared” diye text safety/quality gate atlanmamalı.

## 75A.7 Burst yalnız gerçek breakout/hit'te

Yeni ama sıradan bir observation:

```text
burst mode
```

tetiklememeli.

Burst cadence event-level emergence/hit evidence ister.

## 75A.8 Canonical nested metrics korunmalı

Reader response normalization nested metrics'i kaybedip `0` yapmamalı.

Missing metric:

```text
NULL / unavailable
```

olarak korunmalı.

Acceleration/baseline için kritik.

## 75A.9 Pending approvals görünür kalmalı

History query limit'i yüzünden pending intent kaybolmamalı.

Pending/action-required view ayrı indexed query kullanmalı.

# 76. Current repo migration map

Mevcut repo’daki x-use-specific yüzeylerin tamamı bulunup kaldırılmalı.

Bilinen ana noktalar:

```text
src/server/xuse.ts
src/server/xuse-config.ts
src/server/publisher.ts

src/app/api/accounts/route.ts
src/app/api/accounts/[id]/route.ts

src/app/api/accounts/[id]/xuse/health/route.ts
src/app/api/queue/[id]/xuse/sync/route.ts

README.md
dashboard status/capability fields
db.ts xuse fields
automation jobs xuse fields
PublicationIntent xuse fields
```

Repo-wide search:

```text
xuse
x-use
XUse
XUSE_
xuse_
```

zero-result hedeflenmeli.

---

# 77. DB migration strategy

Bir migration’da destructive rename yapma.

## Phase A additive

Add:

```text
owner_user_id
x_user_id
auth_state

x_oauth_credentials
x_oauth_transactions

publisher_provider
remote_action_id
remote_status
```

Eski xuse kolonları kalır ama yeni code kullanmaz.

## Phase B cutover

Official publisher live.

Tüm new intents official.

## Phase C cleanup

Repo-wide xuse references zero.

Sonra:

```text
xuse_account_id
xuse_queue_id
xuse_status
xuse_checked_at
```

drop/rebuild migration.

SQLite drop-column compatibility dikkatli.

---

# 78. DashboardSummary migration

Bugün:

```text
xuseAvailable
xuseBin
```

Final:

```ts
publisher: {
  provider: "x_api";
  ready: boolean;
  connectedAccounts: number;
  reauthRequired: number;
}
```

UI implementation detail değil operational state gösterir.

---

# 79. README transport section

Eski:

```text
pipx install x-use-mcp
x-use doctor
```

tamamen silinir.

Yeni:

```text
X Developer App
Client ID
Client Secret
Callback
OAuth scopes
```

setup.

Tokenlar manual `.env` access-token olarak tutulmaz.

User OAuth ile bağlanır.

---

# 80. Worker deployment

Mevcut long-running worker avantajdır.

Product hosting için serverless-only varsayma.

Recommended first production topology:

```text
reverse proxy
└── Next.js app
└── worker
└── persistent DB
```

Tek node SQLite ile pilot mümkün.

Horizontal scale gerektiğinde DB migration ayrı project olmalı.

Auth/X migration ile aynı PR’da Postgres rewrite yapma.

---

# 81. SQLite → Postgres kararı

Şimdi zorunlu değil.

Trigger conditions:

- multiple app instances;
- significant concurrent users;
- HA requirement;
- read replicas;
- SQLite lock contention;
- hosted multi-node workers.

O zamana kadar SQLite’in mevcut WAL/lock design’ı korunabilir.

---

# 82. Product UI test matrix

Her primary page:

```text
light
dark
mobile
tablet
desktop
```

Data:

```text
empty
normal
dense
error
loading
permission denied
disconnected X
reauth required
rate limited
```

Visual regression snapshot düşün.

---

# 83. Motion CI

UI Beats’den alınacak iyi fikir:

Reduced motion desteğini “designer unutmasın” beklentisine bırakma.

Test:

```text
interactive motion component
→ reduced motion codepath exists
```

Creator card ve shared indicator test edilmeli.

---

# 84. Accessibility

Minimum:

- keyboard navigation;
- visible focus;
- semantic buttons/links;
- modal focus trap;
- ARIA labels;
- no hover-only information;
- contrast AA;
- reduced motion;
- charts için text summary.

---

# 85. Localization

İlk UI dili Türkçe olabilir.

Ama raw domain terms canonical English enum olarak backend’de kalabilir.

UI mapping:

```text
pending_reconciliation
→ Doğrulama bekliyor
```

Technical detail panel:

```text
pending_reconciliation
```

raw state gösterir.

Future i18n kolay olur.

---

# 86. Open-source public identity

Landing’de:

```text
Open source
GitHub repository
How it works
Security model
Contribute
```

görünür.

Sidebar’da dev bir creator reklamı yerine küçük GitHub link yeterli.

Creator 3D card public surface’te.

---

# 87. Brand copy

Önerilen public hero:

```text
Sinyali erkenden yakala.
Kararı kanıtla.
```

Description:

> İSPATLA, X üzerindeki sinyalleri olaylara dönüştüren, doğru hesap için yayın fırsatlarını sıralayan ve her kararı kanıt zinciriyle izleyen açık kaynak bir X intelligence ürünüdür.

Avoid:

```text
guaranteed viral
beat algorithm
hack X
100% hit
```

---

# 88. Landing page structure

```text
Hero
→ live/product screenshot
→ Observe / Decide / Publish / Learn
→ Why not another scheduler?
→ Evidence/explainability example
→ Open source
→ creator tilt card
→ GitHub / Start
```

Feature bingo grid yapma.

Bir gerçek workflow göster.

---

# 89. “Why not another scheduler?”

İSPATLA farkı:

Scheduler:

```text
user knows what to post
→ schedules it
```

İSPATLA:

```text
finds what matters
→ understands why
→ matches account
→ drafts
→ policy gates
→ schedules/publishes
→ learns
```

Bu positioning homepage’de net olmalı.

---

# 90. Notification design

MVP’de external notification entegrasyonu zorunlu değil.

In-app notification types:

```text
approval needed
publish failed
reauth required
policy block
confirmed
high-confidence opportunity
```

Default:

```text
only actionable
```

Alert fatigue oluşturma.

---

# 91. Opportunity notifications

Her high-score item notification göndermesin.

Dedupe:

```text
cluster
account
stage transition
```

üzerinden.

Örnek:

```text
EMERGING → BREAKOUT
```

bir notification trigger olabilir.

Skor 82→83 değil.

---

# 92. Audit log

Audit event:

```text
actor
action
entity
before
after
reason
timestamp
request_id
```

Actor:

```text
user
system
worker
agent
```

Publish policy’nin güvenilirliği için kritik.

---

# 93. Product telemetry

Privacy-friendly event names:

```text
signup_completed
first_opportunity_viewed
x_connect_started
x_connect_completed
first_draft_generated
first_intent_approved
first_publish_confirmed
```

Raw post text analytics telemetry provider’a gönderilmemeli.

Self-hosted/internal aggregate düşünülebilir.

---

# 94. Pricing/product model bu migration’ın scope’u değil

Billing ekleme.

Önce:

```text
activation
reliability
policy compliance
intelligence quality
```

kanıtlansın.

Plan tier code’u erken eklemek complexity oluşturur.

---

# 94A. XPatla araştırmasından korunacak / kopyalanmayacak dersler

XPatla geçmiş ürün behavior'ı İSPATLA'nın ilham kaynaklarından biri fakat V3
onu “çalışan dependency/otorite” olarak kabul etmez.

Araştırmada eski/indekslenmiş XPatla materyallerinde:

- Clerk account auth;
- bir Clerk account altında 10'a kadar X hesabı;
- official X OAuth bağlantısı;
- source monitoring;
- style analysis;
- tweet/quote/reply drafting;
- queue;
- manual approve;
- auto schedule;
- full autopilot;
- best-time/cadence

gibi product davranışları görülüyor.

Ancak daha yeni legal notice/privacy (10 Temmuz 2026) yeni X account
connections, X data retrieval ve X publishing'in kapatıldığını söylüyor.

Bu nedenle:

1. XPatla'nın UX/product flow fikirleri historical reference'tır.
2. “Onlar yaptıysa API kesin destekler” varsayımı yapılmaz.
3. İSPATLA current X docs/capabilities ile self-contained build edilir.
4. XPatla'nın hidden scoring formula'sı varmış gibi uydurma yapılmaz.
5. Multi-account + progressive automation UX'i alınabilir.
6. Engagement-pod/growth-hack mantığı İSPATLA'nın core'u yapılmaz.

# 95. Research gems — GitHub

Aşağıdaki projeler dependency olarak kör kopyalanmayacak.

**Pattern mining** için kullanıldı.

Star sayıları araştırma anındaki yaklaşık snapshot’tır.

## 95.1 `danniesidequestmaxxing/equities-narrative-tracker` — 0★

Cevher:

```text
self-scoring source credibility
claim-before-send
side-effect idempotency
```

İSPATLA’ya:

- source×category reputation;
- idempotent dispatch claim;
- worker restart duplicate prevention.

---

## 95.2 `ofershap/spotlight-card` — 0★

Cevher:

```text
mouse position
→ radial light
```

50 satırlık fiziksel microinteraction.

İSPATLA’ya:

- creator card specular;
- önemli interactive surface.

---

## 95.3 `rampstackco/neobrutalism-theme` — 1★

Cevher:

```text
design = explicit creative-direction axes
play layer separated from structural layer
```

İSPATLA’ya:

- design register;
- “effect everywhere” değil controlled play;
- token decisions documented.

Görsel stil birebir neobrutalism olmak zorunda değil.

Asıl alınacak şey karar sistemi.

---

## 95.4 `suryamr2002/langgraph-approval-hub` — 3★

Cevher:

```text
pending
approved
rejected
expired

decision note
audit log
detail screen
```

İSPATLA’ya:

- explicit approval lifecycle;
- expiry;
- realtime pending approvals;
- audit.

---

## 95.5 `felixpeters/tweet-engagement-prediction` — 6★

Cevher:

- real-time usable input hedefi;
- outcome class prediction;
- heterogeneous account cohorts;
- 1.3M tweet deneyimi.

İSPATLA’ya direkt eski model değil:

```text
account-relative outcome
residual prediction
```

fikri.

---

## 95.6 `TwitterTrendDectection/TwitterTrendDetection` — 7★

Cevher:

```text
background_model
hot_words
group_burst
personalize
```

İSPATLA’ya:

```text
background vs current rate
→ emergence
```

---

## 95.7 `JialiangFan/X-MCP-2.0` — 7★

Cevher:

- OAuth 2.0 PKCE;
- token refresh;
- typed X actions;
- post/reply/repost ayrımı.

Kopyalanmayacak kısmı:

- plaintext user token file yaklaşımı product server için kullanılmayacak.

---

## 95.8 `HasData/social-listening-tool` — ~21★

Cevher:

```text
collect
structured infer
only-new delta
notify
repeat
```

İSPATLA’ya:

- incremental insight;
- “new evidence since last check”;
- query spawning feedback.

---

## 95.9 `kg0r0/twitter-oauth2` — 25★

Cevher:

- confidential/public client distinction;
- PKCE auth middleware;
- session-bound OAuth transaction.

İSPATLA dependency olmak zorunda değil.

OAuth flow test referansı.

---

## 95.10 `agentkitai/agentgate` — 33★

Cevher:

```text
policy engine:
allow
deny
human approval

full audit
request detail
```

İSPATLA’ya:

- agent writes same policy engine;
- action intent;
- audit timeline;
- no direct agent side effect.

---

## 95.11 `Halaska-Studio/ui` — 39★

Cevher:

AI/agent product’larda:

```text
Thinking
Plan
Approval
Agent status
Action receipt
Error repair
```

gibi UX pattern’leri ayrı ürün primitive’leri yapıyor.

İSPATLA’ya özellikle:

```text
ApprovalCard
ActionReceipt
ErrorRepair
AgentStatus
```

yaklaşımı.

---

## 95.12 `Xquik-dev/tweetclaw` — ~94★

Cevher:

```text
safe explore
vs
live tool

per-call approval
idempotency key
capability discovery
```

İSPATLA’ya:

- agent action catalog;
- capability registry;
- write permission gate;
- structured request review.

---

## 95.13 `nikhils4/ui-beats` — ~233★

Cevher:

- Tilt Card;
- Magnetic Button;
- shared motion thinking;
- Motion Studio;
- token integration;
- reduced-motion test enforcement.

İSPATLA’ya dependency olarak bütün library alınmayacak.

Pattern seçilecek.

---

## 95.14 `amitbara3/taskyard` — 0★

Cevher:

```text
SQLite durable queue
lease reservation
heartbeat
janitor
backoff + jitter
DLQ
per-job timeline
pause/resume/drain
idempotency
SIGKILL crash tests
```

İSPATLA için en yüksek ROI production pattern'lerinden biri.

Dependency olarak almak zorunda değiliz; queue invariants'ını kendi worker'ımıza
uygulayacağız.

---

## 95.15 `HazemDev-1/outbox-relay` — 0★

Cevher:

```text
transactional outbox
atomic claim
idempotent enqueue
guarded state transition
Retry-After awareness
at-least-once semantiğini dürüstçe kabul etme
```

İSPATLA için ders:

remote X side effect'i üzerinde magical exactly-once iddiası yapma; local claim
+ reconciliation kur.

---

## 95.16 `parth012001/greenlight` — 0★

Cevher:

```text
policy action layer'da
model bypass edemez
autonomy exact action shape'e kazanılır
clean history → promotion suggestion
bad autonomous run → demotion
tamper-evident audit fikri
default closed
```

İSPATLA'da global “AI'ya güven” switch'i yerine scoped automation trust.

---

## 95.17 `iveteamorim/decision-room` — ~2★

Cevher:

```text
deterministic policy
weighted decision
human checkpoint
explanation trace
policy simulation
audit
```

En önemli transfer:

**policy change'i historical decisions üzerinde replay etmeden production'a
alma.**

---

## 95.18 `JayKumarr/OSDM` — ~17★

ACL 2020 short-text stream clustering.

Cevher:

```text
online incremental clustering
```

İSPATLA event engine tüm geçmişi her tick re-cluster etmek yerine active state
tutmalı.

---

## 95.19 `irhafidz/semantic-cib-detection` — 0★

Cevher:

```text
semantic + temporal coordination
adaptive threshold
empirical quantile
embedding anisotropy awareness
human-labeled validation
```

İSPATLA:

- fixed global cosine threshold kullanmayacak;
- coordinated posting'i independent evidence sanmayacak;
- “coordination likelihood”ı accusation değil internal discount olarak kullanacak.

---

## 95.20 `mohammadi-hadi/calikit` — 0★

Cevher:

```text
Brier
log loss
ECE + CI
reliability diagram
temperature / Platt / isotonic
calibration != discrimination
```

İSPATLA'nın `publishConfidence` gibi alanlarını literal probability yapmadan
önce calibration şartı.

---

## 95.21 `tcballard/brierly` — ~2★

Cevher:

```text
prediction
resolve-by
outcome
due unresolved
```

İSPATLA learning ledger'ında unresolved predictions görünür olacak.

---

## 95.22 `xai-org/x-algorithm` — büyük repo, fakat primitive kaynağı

Bu repo düşük yıldız “cevher” kategorisinde değil; X'in güncel açık kaynak
ranking mimarisini anlamak için ayrı referans.

Alınan dersler:

```text
candidate→hydrate→filter→score→select→filter→side effects
multi-outcome predictions
diversity
holdouts/experiments
```

Alınmayan:

```text
exact weights
“X algoritmasını çözdük” iddiası
raw engagement weight kopyası
```

# 96. Research gems — Reddit

Reddit burada “gerçek kullanıcı hangi problemde takılıyor?” için kullanıldı.

## 96.1 Generic shadcn görünümü

Tekrarlanan feedback:

```text
looks like every shadcn dashboard
generic
AI/vibe-coded
```

Sonuç:

İSPATLA personality’yi:

```text
more gradients
more cards
more icons
```

ile değil;

```text
decision hierarchy
evidence
motion language
unique product workflow
```

ile kurmalı.

---

## 96.2 Production-ready = page count değil flow completeness

Önemli fikir:

```text
auth
→ dashboard
→ list/detail
→ edit/action
→ empty/error/loading
→ permissions
```

tek gerçek workflow polish’i, 20 demo page’den daha değerlidir.

Codex önce core flow’u bitirsin.

---

## 96.3 Social management’in asıl problemi state

İçerik:

```text
idea
creating
editing
approval
ready
scheduled
published
failed
```

arasında kayboluyor.

İSPATLA Draft/Queue state machine UX’de görünür olmalı.

---

## 96.4 Scheduler’ın en zor kısmı cron değil platform edge-case’leri

Research takeaway:

```text
token expires mid-post
permission review changes
rate limit
platform capability mismatch
```

gerçek sorunlar.

Bu nedenle publisher:

- capability aware;
- token-health aware;
- unknown-state safe;
- explicit error taxonomy

olmalıdır.

---

## 96.5 Empty dashboard activation öldürüyor

İlk session:

```text
blank widgets
No data
connect something
```

kötü.

İSPATLA:

```text
Shadow mode
sample/live radar
guided first opportunity
```

ile başlatmalı.

---

## 96.6 “Real damage” korkusu

Kullanıcı ilk action’ın gerçekten dış dünyaya gitmesinden korkabilir.

UI çok net:

```text
SHADOW — hiçbir şey X’e gönderilmiyor
```

göstermeli.

İlk publish’e kadar sandbox psikolojisi korunmalı.

---

## 96.7 Open-source contributor activation

Cevher:

- clear problem;
- one quick-start path;
- architecture guide;
- good first issue;
- small roadmap;
- fast maintainer response.

Repo “source dump” değil product repository gibi yönetilmeli.

---

## 96.8 Scheduler state atomik ve görünür olmalı

Reddit scheduler uygulamalarında iyi pattern:

```text
Scheduled
Changed
Published
Failed
```

event'lerinin ayrı olması; calendar'ın upcoming ve geçmiş posted/failed state'leri
birlikte göstermesi.

Ayrıca scheduler identity'sinin sessizce başka hesaba taşınmaması önemli.

İSPATLA:

- scheduled account değişirse implicit mutation yapmaz;
- approval invalid olur / yeni revision gerekir;
- account publish-time'da kullanılamıyorsa başka hesaba fallback etmez.

---

## 96.9 “Scheduled successfully” en tehlikeli küçük yalandır

Gerçek scheduler kullanıcılarında sık görülen güven kırıcı pattern:

```text
success toast
→ calendar'da item yok
```

İSPATLA local durable state'i oluşmadan success UX göstermeyecek.

---

## 96.10 Refresh-token race gerçek production problemidir

Reddit webdev tartışmalarında concurrent refresh isteklerinin rotating refresh
token'ı tüketip diğer request'leri bozması tekrar eden problem.

İSPATLA çözümü frontend mutex değil:

```text
server-side account refresh single-flight
DB lease / token_version CAS
re-read-after-lock
```

Multi-tab browser davranışı publisher token lifecycle'ını yönetmemeli.

---

## 96.11 Default Shadcn problem değil, default bırakmak problem

Reddit'teki karşı görüş de önemli:

Kullanıcıların çoğu Shadcn kullandığını fark etmeyebilir ve familiar UI güven
verebilir.

Dolayısıyla hedef:

```text
Shadcn'i gizlemek için tuhaflık
```

değil.

Hedef:

```text
Shadcn primitive reliability
+
İSPATLA'ya özgü information architecture
+
product-specific visual grammar
```

olmalı.

---

## 96.12 İlk useful result setup'tan önce

Ekim 2026 SaaS onboarding tartışmalarındaki en güçlü pattern:

```text
settings
invite team
connect integration
blank dashboard
```

ile başlamak yerine realistic sample/live data ile core result göster.

İSPATLA Shadow-first onboarding bu yüzden normatif.

---

## 96.13 OSS contributor community Discord ile başlamaz

Yeni OSS repo tartışmalarında:

- küçük ve bağlamlı issue;
- iyi docs;
- başka projelere katkı/veri paylaşımı;
- hızlı maintainer feedback

Discord sunucusundan daha önemli çıkıyor.

İSPATLA “community” kurmadan önce contribution path'i optimize etmeli.

# 97. En önemli yeni product insight’ları

Bu araştırma sonrası önceki plandan daha güçlü hale gelen kararlar:

## 97.1 Better Auth yalnız app auth

X connection custom.

## 97.2 Public landing ≠ control room

Creator card public surface’te.

## 97.3 First-run Shadow Mode

Boş dashboard yok.

## 97.4 Approval revision immutability

Approved text değişirse approval invalid.

## 97.5 Claim-before-send

Worker restart duplicate post üretemez.

## 97.6 Error Recovery first-class UX

“Something went wrong” yok.

## 97.7 Event is the product object

Tweet değil.

## 97.8 Score vector

Tek gizemli 0–100 değil.

## 97.9 Learn from rejected opportunities

Missed-hit observatory.

## 97.10 Open-source claim requires real license

Badge yetmez.

---

## 97.11 X-only provenance bir sınırlama değil, ürün kimliği

İSPATLA genel “internet trend finder” olmayacak.

Bu sayede:

- data contract daha net;
- source lineage daha ölçülebilir;
- X-native reply/quote/repost graph kullanılabilir;
- competitor gap doğrudan platform içinde ölçülür;
- style/outcome feedback aynı domain'de kalır.

## 97.12 Event'in altında Claim olmalı

Sadece semantic cluster, çelişkili iddiaları aynı truth gibi birleştirebilir.

`Event → Claim → Observation` ayrımı verification ve explainability için moat.

## 97.13 Confidence calibration ürün özelliğidir

“AI %92 emin” yazmak polish değil teknik borçtur.

Reliability diagram ve Brier/log-loss internal analytics'te first-class olmalı.

## 97.14 Queue product reliability'nin kalbidir

İSPATLA hit bulup iyi draft yazsa bile:

```text
duplicate publish
lost schedule
silent token expiry
stuck dispatch
```

varsa ürün başarısızdır.

Lease/DLQ/reconciliation intelligence kadar önemli.

## 97.15 Auto mode binary değil scoped trust

Manual → Assist → Auto ürün seviyesinde kalır.

İçte autonomy action-shape bazlıdır ve policy failure'da geri alınabilir.

## 97.16 Policy deployment da experiment'tir

Policy değişikliği historical replay/simulation ile effect diff göstermelidir.

## 97.17 Coordination resistance corroboration'ın ön koşuludur

100 yakın-kopya post, 100 bağımsız kaynak değildir.

## 97.18 X algorithm'dan weight değil pipeline discipline alınır

Retrieve/hydrate/filter/score/select/filter/side-effect ayrımı İSPATLA'nın
decision architecture'ını temizleştirir.

# 98. Implementation phases — V3 dependency order

Aşağıdaki sıra dependency graph'tir. Codex paralel yapılabilecek küçük işleri
paralel yapabilir fakat phase exit criteria sağlanmadan sonraki riskli write
phase'i production'a açılmaz.

---

## Phase 0 — Baseline freeze + correctness debt

Önce:

```text
bun test
bun run typecheck
bun run lint
bun run build
```

Current repo fixtures/snapshots kaydet.

Repo-wide inventory:

```text
xuse
x-use
XUSE_
PublicationIntent
automation_jobs
scheduledAt
publishing_paused
pending_reconciliation
```

Fix/lock tests:

- prior intent olmadan confirm yok;
- schedule gerçekten enforce;
- stale dispatch recovery;
- cancelled retry new attempt identity;
- pause write path'i kesiyor;
- quality/sensitivity gate her source-backed intent'te;
- burst yalnız hit/breakout;
- nested metrics/missingness korunuyor;
- pending approvals query'den kaybolmuyor;
- worker heartbeat/copy truthfulness.

**Exit:** baseline green ve known publication invariants test altında.

---

## Phase 1 — Better Auth + ownership boundary

- Better Auth DB-backed sessions;
- signup/login/logout/reset/verification lifecycle;
- `/app` protection;
- `owner_user_id`;
- every account-scoped mutation ownership check;
- no teams/org/billing.

**Exit:** two-user isolation e2e.

---

## Phase 2 — X OAuth2 PKCE + explicit automation consent

- `x_oauth_transactions`;
- 30-second auth-code exchange path minimal;
- encrypted token vault;
- `/users/me`;
- multiple X accounts/user;
- automation-consent table/version;
- reconnect/disconnect;
- scope diff.

**Exit:** two connected X accounts; replay invalid; no plaintext tokens;
consent independently revocable.

---

## Phase 3 — Refresh-token concurrency hardening

- pre-expiry refresh;
- server-side single-flight;
- account lease;
- `token_version` CAS;
- refresh rotation-safe write;
- re-read-after-lock;
- invalid_grant → reauth;
- chaos test simultaneous refresh.

**Exit:** 20 concurrent requests do not corrupt connected account state.

---

## Phase 4 — Durable job/intent spine

Before official live write:

- lease-based job reservation;
- heartbeat;
- stale janitor;
- attempt-on-reserve;
- jitter/backoff;
- DLQ;
- job event timeline;
- durable schedule;
- local-success semantics.

**Exit:** SIGKILL tests recover without duplicate synthetic side effect.

---

## Phase 5 — Official X publisher in SHADOW/test mode

Implement:

```text
OfficialXClient
OfficialXPublisher
capability registry
error taxonomy
rate-limit headers
```

Actions:

```text
post
repost
media
manual/eligible reply
```

Quote disabled unless entitlement check says yes.

No like/DM.

**Exit:** no production auto writes yet; test account/manual smoke works.

---

## Phase 6 — Claim-before-send + reconciliation

- dispatch claim;
- `unknown_remote_state`;
- no blind write retry;
- receipt persistence;
- remote verification;
- confirmed state;
- recovery worker.

**Exit:** network-loss chaos tests produce zero intentional duplicate dispatch.

---

## Phase 7 — x-use ZERO

Delete:

```text
src/server/xuse.ts
src/server/xuse-config.ts
xuse health/sync routes
cookie/config glue
xuse DB fields after additive cutover
README setup
dashboard xuse copy
```

Repo search:

```text
xuse
x-use
XUse
XUSE_
```

must be zero outside historical migration docs/changelog.

**Exit:** clean clone runs product without x-use, Chromium or X cookies.

---

## Phase 8 — Policy engine + X compliance

Implement deterministic gates:

- explicit automation consent;
- automated-like hard deny;
- unsolicited auto-reply deny;
- trend-only auto-post deny;
- cross-account duplicate;
- near-copy;
- repost aggression/cooldown;
- sensitive/media;
- account/category/action kill switches;
- capability/entitlement;
- user opt-out.

Add policy version.

**Exit:** golden policy suite and UI/agent/worker all call same engine.

---

## Phase 9 — Public product shell + private control room

- `ispatla.tr/` landing;
- `/app` control room;
- docs/security/privacy/terms;
- real OSS identity;
- design tokens/register;
- simplified nav;
- unique product visual grammar;
- creator 3D tilt card public surface only;
- reduced motion.

**Exit:** marketing and operational state no longer mixed.

---

## Phase 10 — Shadow-first onboarding

- first useful sample/live X opportunity;
- no blank dashboard;
- Shadow/Live visible;
- guided opportunity explanation;
- Connect X after product value is visible;
- first draft;
- explicit consent;
- first manual publish.

Track activation funnel.

---

## Phase 11 — Approval / Queue / Recovery product UX

- pending/approved/rejected/expired;
- immutable approval revision;
- list + calendar;
- action receipts;
- error repair;
- reauth CTA;
- DLQ UI;
- job timeline;
- URL-synced filters.

**Exit:** every failed write can answer “what happened / did X receive it / what next?”

---

## Phase 12 — Event → Claim → Observation shadow model

Do **not** delete old cluster logic yet.

Build parallel:

- immutable Observation;
- Event;
- Claim;
- lineage graph;
- evidence families;
- online candidate clustering;
- merge/split audit;
- adaptive semantic thresholds.

Create hand-labeled fixture.

**Exit:** measured clustering quality; old selector unchanged.

---

## Phase 13 — Emergence + lifecycle + broadcast/cascade

- robust temporal baselines;
- 2/5/10/20/60m + longer windows;
- acceleration;
- age-normalized overperformance;
- emergence;
- SEED→DECAY stages;
- broadcast/cascade/coordinated classification;
- coordination discount.

**Exit:** backtest + shadow decision logs.

---

## Phase 14 — Source-topic reputation + X corroboration

- Bayesian shrinkage;
- source×category/topic;
- lead-time reputation;
- root-family independence;
- claim support/contradiction;
- source diversity.

**Exit:** small-sample source cannot dominate; coordinated clusters discounted.

---

## Phase 15 — Account Fit + format decision + AI routing

- account×category configs;
- voice profile;
- topic fatigue;
- source fatigue;
- format history;
- account/purpose AI routes;
- post/repost/reply chooser;
- quote capability gate;
- best-time/quiet-hour/daily cap.

**Exit:** same event can rationally map to different account/format decisions.

---

## Phase 16 — EIR / account-relative outcome shadow evaluator

- account baseline;
- residual;
- percentile;
- EIR features;
- competitor gap;
- cannibalization;
- prediction ledger.

Start deterministic/tabular baseline.

CatBoost/LightGBM may be challenger when data volume warrants; do not install a
complex model merely because it was in the old plan.

**Exit:** out-of-sample baseline beats naive account/category baseline.

---

## Phase 17 — Calibration layer

- Brier;
- log loss;
- reliability diagram;
- ECE + sample count/CI;
- calibration split;
- due/unresolved prediction queue;
- calibrated naming rules.

**Exit:** UI never labels uncalibrated score as probability.

---

## Phase 18 — Missed-Hit Observatory + counterfactuals

Log all candidate decisions, not just publishes.

Classify:

```text
false positive
missed hit
late hit
wrong account
wrong format
policy block
publisher failure
cannibalization
```

Add champion/challenger and policy simulator.

**Exit:** “neden kaçırdık?” can be answered from stored data.

---

## Phase 19 — Holdout + exploration

First:

```text
shadow holdout
manual exploration bucket
selection propensity
```

Later, enough data:

```text
contextual/Thompson-style allocator
```

No blind autonomous exploration.

---

## Phase 20 — Earned automation

Use clean approval/history data to **suggest** scoped auto-approval.

User explicitly opts in.

Automatic demotion on:

- policy failure;
- auth failure causing unsafe uncertainty;
- duplicate-risk incident;
- unacceptable autonomous outcome condition defined by product.

No silent promotion.

---

## Phase 21 — OSS release hardening

- choose/commit LICENSE; AGPL-3.0-or-later remains recommended for hosted
  open-source product unless project strategy explicitly chooses permissive;
- CONTRIBUTING;
- SECURITY;
- architecture;
- changelog;
- fixture reader/publisher;
- `ISPATLA_DEMO=1`;
- good-first-issues;
- reproducible local setup;
- docs that match actual worker behavior.

**Exit:** contributor can clone → install → demo without X credentials.

# 99. Test plan

## 99.1 Auth

- signup
- login
- logout
- session expire
- session revoke
- unauthenticated `/app`
- cross-user account access
- CSRF/mutation

## 99.2 X OAuth

- valid PKCE
- invalid state
- expired transaction
- replay
- wrong callback
- code exchange failure
- missing scopes
- same X account linked twice
- reconnect
- disconnect
- revoke
- refresh
- refresh race

## 99.3 Publisher

- post success
- repost success
- reply manual
- reply policy blocked
- media
- rate limit
- 401
- entitlement missing
- timeout before remote
- timeout unknown
- worker crash after claim
- worker crash after remote request
- duplicate tick

## 99.4 Policy

- auto like always denied
- keyword auto reply denied
- opted-in reply allowed
- trend-only auto post denied
- near duplicate same account denied
- near duplicate cross-account denied
- aggressive repost sequence denied
- safe original allowed

## 99.5 Queue

- approve
- edit after approval
- schedule
- cancel
- account disconnect while scheduled
- token expires before schedule
- unknown remote state
- reconciliation

## 99.6 UI

- first run
- Shadow
- X disconnected
- reauth
- empty
- dense
- error
- mobile
- reduced motion
- keyboard

## 99.7 Intelligence

- missing metric remains null
- cluster merge fixtures
- split fixtures
- burst backtest
- source reputation shrinkage
- independent evidence grouping
- missed-hit labeling
- selector version snapshot

---

# 100. Chaos tests

Özellikle yap:

```text
kill worker after dispatch claim
kill worker during token refresh
two worker ticks same intent
refresh token rotates concurrently
X returns 429
X returns 500
network drops after request body sent
DB temporarily locked
reconciliation delayed
```

Beklenti:

```text
no duplicate external write
```

---

# 101. Acceptance criteria — product launch

İSPATLA product-ready sayılmadan:

- [ ] Better Auth session live.
- [ ] X custom PKCE live.
- [ ] No x-use runtime.
- [ ] No browser cookie auth.
- [ ] No plaintext X token.
- [ ] Multiple X accounts/user.
- [ ] Original post official API.
- [ ] Repost official API.
- [ ] Media official API.
- [ ] Reply policy gate.
- [ ] Quote entitlement gate.
- [ ] No automated likes.
- [ ] Dispatch idempotency.
- [ ] Unknown remote state safety.
- [ ] Reconciliation.
- [ ] Shadow mode.
- [ ] Global/account kill switch.
- [ ] Public landing.
- [ ] `/app` control room.
- [ ] Non-empty first-run.
- [ ] Open-source license.
- [ ] Privacy/Security.
- [ ] Mobile/reduced motion.
- [ ] Core e2e.
- [ ] Demo contributor mode.

---

# 102. Definition of “good product UX”

Success screenshot güzelliği değildir.

Kullanıcı şu journey’yi açıklamasız tamamlayabiliyorsa UX iyi:

```text
signup
→ sees why ISPATLA matters
→ understands Shadow
→ sees real/sample opportunity
→ connects X
→ sees connected account health
→ opens opportunity
→ understands why now
→ generates/edits draft
→ sees policy result
→ approves
→ sees scheduled/dispatch state
→ sees confirmed receipt
→ later sees performance
```

---

# 103. Definition of “good intelligence”

İSPATLA iyi sayılmaz çünkü:

```text
çok candidate buldu
```

İyi sayılır çünkü:

```text
daha erken buldu
daha az false positive verdi
doğru hesaba verdi
saturation öncesi verdi
kaçırdıklarından öğrendi
prediction calibration iyileşti
```

---

# 104. Definition of “good automation”

Automation:

```text
daha çok action
```

değildir.

İyi automation:

```text
safe
predictable
auditable
recoverable
policy-compliant
```

olmalıdır.

---

# 105. Codex için implementation kuralları

1. Büyük rewrite yapma.
2. Her phase küçük PR/commit seti.
3. Existing invariant testlerini silme.
4. Additive DB migration first.
5. Feature flag ile rollout.
6. Official publisher manual mode’da kanıtlanmadan auto mode enable etme.
7. Intelligence challenger shadow kanıtlanmadan production selector değiştirme.
8. UI component library eklemek yerine mevcut shadcn primitive’lerini token/motion ile özelleştir.
9. 3D için Three.js ekleme.
10. Auth için Clerk ekleme.
11. X provider connection için Better Auth social linking kullanma.
12. x-use fallback bırakma.
13. Automated like ekleme.
14. DM ekleme.
15. Quote capability’yi entitlement olmadan promise etme.
16. User-facing error’larda raw token/provider payload gösterme.
17. X policy guard’larını prompt’a bırakma.
18. User edit sonrası stale approval kullanma.
19. Network-unknown write’ı kör retry etme.
20. “unknown metric” değerini sıfıra çevirme.

---

# 106. En yüksek ROI sıralaması

Tüm plan çok büyük görünürse ilk gerçek product milestone:

```text
Better Auth
→ Custom X OAuth
→ Official Publisher
→ x-use zero
→ Shadow/Live
→ product shell
→ first-run opportunity
→ approval/receipt/recovery
```

Sonra moat:

```text
Semantic EventCluster
→ Emergence
→ Source Reputation
→ Corroboration
→ Missed Hit Observatory
→ Account-relative learning
```

Güzel ama commodity işler:

```text
more charts
more dashboard pages
more AI buttons
more settings
more animations
```

sonra gelir.

---

# 107. Nihai mimari

```text
                         ispatla.tr
                             │
             ┌───────────────┴───────────────┐
             │                               │
       Public Product                    /app Control Room
             │                               │
     OSS / docs / trust               Better Auth session
                                             │
                                             ▼
                                     Product user boundary
                                             │
                                  ┌──────────┴──────────┐
                                  │                     │
                           X account A            X account B
                                  │                     │
                         OAuth2 PKCE             OAuth2 PKCE
                                  │                     │
                            encrypted token vault
                                  │
                                  ▼
                           Official X API
                                  │
                  ┌───────────────┼───────────────┐
                  │               │               │
                 post           repost          media
                  │
               reply
             policy-gated

Reader / intelligence side:

XReader / FxTwitter
       │
       ▼
Normalization + provenance
       │
       ▼
Semantic EventCluster
       │
       ├─ Background baseline
       ├─ Emergence / burst
       ├─ Source reputation
       ├─ Corroboration
       └─ Lifecycle
       │
       ▼
Account Fit
       │
       ▼
Draft variants
       │
       ▼
Deterministic Policy Engine
       │
       ▼
ActionIntent
       │
       ├─ Assist → human approval
       └─ Auto → eligible policy approval
       │
       ▼
Claim-before-send
       │
       ▼
OfficialXPublisher
       │
       ▼
Receipt
       │
       ▼
Reconciliation
       │
       ▼
Feedback snapshots
       │
       ├─ published outcomes
       └─ rejected/missed outcomes
       │
       ▼
Calibration / stronger future decisions
```

---

# 108. Nihai ürün ilkesi

İSPATLA’nın kullanıcıya hissettirmesi gereken şey:

> “Bu bot benim yerime rastgele tweet atmıyor. Dünyada ne olduğunu izliyor, neden bir fırsat olduğunu bana gösteriyor, hangi hesabım için uygun olduğunu açıklıyor, güvenli sınırlar içinde aksiyon alıyor ve sonucunu ispatlıyor.”

Bütün auth, UI, policy, publisher ve intelligence kararları bu cümlenin altında hizalanmalıdır.

---

# 109. Araştırma referansları

Bu plan hazırlanırken özellikle incelenen kaynak aileleri:

## Official X

- X Automation Rules — April 2026
- X OAuth 2.0 Authorization Code Flow with PKCE
- X API Create Posts reference

## Auth

- Better Auth OAuth/account-linking docs
- Better Auth current GitHub issues around account linking, stateless token refresh, refresh-token rotation and OAuth sessions

## GitHub “küçük cevherler”

- `danniesidequestmaxxing/equities-narrative-tracker`
- `ofershap/spotlight-card`
- `rampstackco/neobrutalism-theme`
- `suryamr2002/langgraph-approval-hub`
- `felixpeters/tweet-engagement-prediction`
- `TwitterTrendDectection/TwitterTrendDetection`
- `JialiangFan/X-MCP-2.0`
- `HasData/social-listening-tool`
- `kg0r0/twitter-oauth2`
- `agentkitai/agentgate`
- `Halaska-Studio/ui`
- `Xquik-dev/tweetclaw`
- `nikhils4/ui-beats`

## Reddit research themes

- generic shadcn dashboard fatigue
- production dashboard completeness
- empty-state activation failure
- safe sandbox first action
- social scheduling approval state
- token expiry / platform API edge cases
- OSS contributor onboarding
- actionable failure/recovery UX

---

# 109A. V3 derin araştırma ekleri

## Güncel resmi X doğrulamaları — 7 Ekim 2026

### OAuth 2.0 PKCE

Official docs:

`https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code`

Doğrulananlar:

- default access token lifetime: 2 saat;
- `offline.access` olmadan refresh token yok;
- `tweet.write`: create + repost;
- `media.write`: upload media;
- Web App / Automated App / bot confidential client olabilir;
- callback exact match;
- approved auth code yaklaşık 30 saniye içinde exchange edilmeli.

### Create Post

`https://docs.x.com/x-api/posts/create-post`

Doğrulanan:

- `POST /2/tweets`;
- `users.read tweet.read tweet.write`;
- `quote_tweet_id` self-serve pay-per-use değil, Enterprise;
- response remote post ID verir;
- API schema `made_with_ai` / `paid_partnership` gibi alanları içeriyor fakat
  İSPATLA bunların ürün semantics'ini ayrı doğrulamadan otomatik set etmemeli.

### Rate limits

`https://docs.x.com/x-api/fundamentals/rate-limits`

Plan-date snapshot:

- create post 100/15m per user, 10k/24h per app;
- repost 50/15m per user;
- `/users/me` 75/15m;
- rate headers runtime source-of-truth.

### Automation rules

`https://help.x.com/en/rules-and-policies/x-automation`

Doğrulanan:

- OAuth tek başına automated-action consent değildir;
- action types açıkça anlatılmalı;
- express consent alınmalı;
- opt-out hemen uygulanmalı;
- automated likes yasak;
- automated repost/quote policy uyumlu biçimde mümkün ama bulk/aggressive
  repost yasak;
- trend başlıkları hakkında kör otomatik yayın yasak;
- unsolicited keyword-based replies yasak;
- duplicate/substantially similar multi-account automation riskli/yasak.

---

## XPatla historical reference

- `https://api.xpatla.com/legal/terms`
- `https://api.xpatla.com/legal/privacy`
- `https://xpatla.com/xagent`

Eski terms/XAgent materyalleri multi-account (10), Clerk, source monitor,
voice/style, queue ve progressive automation davranışlarını gösteriyor.

Daha yeni 10 Temmuz 2026 legal notice ise yeni X connection/retrieval/publishing
işlevlerinin disabled olduğunu belirtiyor.

V3 bu yüzden XPatla'yı product-flow referansı olarak kullanır, technical
dependency veya current capability authority olarak değil.

---

## GitHub V3 gems

```text
amitbara3/taskyard
HazemDev-1/outbox-relay
parth012001/greenlight
iveteamorim/decision-room
JayKumarr/OSDM
irhafidz/semantic-cib-detection
mohammadi-hadi/calikit
tcballard/brierly
danniesidequestmaxxing/equities-narrative-tracker
TwitterTrendDectection/TwitterTrendDetection
felixpeters/tweet-engagement-prediction
agentkitai/agentgate
suryamr2002/langgraph-approval-hub
Halaska-Studio/ui
Xquik-dev/tweetclaw
ofershap/spotlight-card
rampstackco/neobrutalism-theme
nikhils4/ui-beats
kg0r0/twitter-oauth2
JialiangFan/X-MCP-2.0
xai-org/x-algorithm
```

Pattern'ler kopyalanır; repo dependency'leri kör eklenmez.

---

## Reddit V3 research themes

Araştırılan güncel tartışmalardan çıkan recurring failure modes:

1. onboarding bitiyor ama first action olmuyor;
2. blank dashboard activation öldürüyor;
3. ilk gerçek side-effect'te “zarar verir miyim?” korkusu var;
4. default Shadcn generic görünebiliyor fakat familiar UI da trust sağlayabiliyor;
5. production-ready algısı page count'tan değil complete vertical flow'dan geliyor;
6. approval/scheduling state'leri görünür değilse ekip kayboluyor;
7. success toast ile persisted calendar state uyuşmazsa güven kırılıyor;
8. OAuth refresh race multi-request/multi-tab sistemlerde gerçek edge-case;
9. OSS contributor için iyi issue context/docs, boş Discord'dan daha değerli;
10. failed scheduled actions reason + recovery CTA istemeli.

Bunlar V3 onboarding, queue, refresh, UI ve OSS bölümlerine normatif
gereksinim olarak işlendi.

# 110. Son karar özeti

```text
AUTH
Better Auth, DB-backed.
X login != app login.

X CONNECTION
Custom OAuth 2.0 PKCE.
Encrypted token vault.
Multiple X accounts per user.

SCOPES
tweet.read
tweet.write
users.read
media.write
offline.access

NO
DM
automated likes
cookie/browser automation
x-use fallback

YES
post
repost
media
reply with policy eligibility
quote only when entitlement says yes

PUBLISHER
claim-before-send
no blind retry
receipt + reconciliation

PRODUCT
public landing + private /app
Shadow/Live
guided first value
real open-source identity

UI
technical/editorial
single accent
three surfaces
one controlled 3D tilt card
restrained motion
receipts/recovery first-class

INTELLIGENCE
EventCluster
Emergence
Source Reputation
Corroboration
Lifecycle
Account Fit
Missed Hit Observatory
shadow challenger
calibration
exploration later

CORE PROMISE
observe → understand → decide → compose → gate → publish → verify → learn
```


V3 ek kararlar:

```text
DATA
X-only runtime intelligence.
External web/RSS/news ingestion yok.

DOMAIN MODEL
Event → Claim → Observation.
Lineage + EvidenceFamily.

RADAR
online incremental clustering
adaptive semantic thresholds
broadcast vs organic cascade vs coordinated cluster

DECISION
hard policy != score
multi-objective score vector
source diversity
topic fatigue
EIR as own calibrated estimate, never X internal score

QUEUE
lease + heartbeat + janitor + DLQ
attempt-on-reserve
claim-before-send
unknown remote state
reconciliation

CONSENT
OAuth != automation consent
versioned explicit consent
immediate opt-out

AUTONOMY
Observe / Assist / Auto UX
internally scoped action-shape trust
promotion only with user confirmation
automatic demotion on unsafe failures

LEARNING
published + rejected opportunities
due/unresolved outcomes
Brier/log-loss/reliability
holdout/challenger
policy replay simulator

DESIGN
Shadcn stays
product-specific Signal Pulse / Evidence Rail / Decision Stack / Receipt Stamp
creator tilt card only public/product surface
```
