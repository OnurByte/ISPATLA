# İSPATLA V4 — Social AI HitMaker
## Product Refactor, Identity, Personalization & Global Expansion

**Proje:** https://github.com/OnurByte/ISPATLA  
**Domain:** https://ispatla.tr  
**Ürün adı:** İSPATLA  
**Konumlandırma:** Social AI HitMaker  
**Hedef:** Mevcut V3 altyapısını koruyarak İSPATLA'yı geliştiricilere yönelik bir kontrol panelinden, sıradan bir X kullanıcısının da birkaç dakika içinde kullanabileceği, kişiselleştirilmiş bir sosyal içerik ürününe dönüştürmek.

---

# 1. Temel ürün ilkeleri

İSPATLA'nın amacı kullanıcının X hesabını analiz edip hesabına uygun içerik fırsatları bulmak, taslaklar hazırlamak ve gerçek yayın sonuçlarından öğrenmek.

Yeni sürümün ilkeleri:

1. **Zero-config onboarding:** Kullanıcı X hesabını bağladıktan sonra elle kategori oluşturmak, JSON düzenlemek veya teknik parametrelerle uğraşmak zorunda kalmamalı.
2. **Progressive disclosure:** Basit ayarlar herkese, ileri düzey kontroller isteyenlere gösterilmeli.
3. **Account-first personalization:** Kategori, üslup, dil ve içerik önerileri bağlanan X hesabına göre şekillenmeli.
4. **BYOK-first:** Kullanıcı kendi AI sağlayıcısını ve anahtarını kullanabilmeli. Tek bir operatör API anahtarı bütün kullanıcılara hizmet vermemeli.
5. **Privacy by default:** Profil ve hit paylaşımı opt-in olmalı. E-posta, API anahtarı, özel taslak ve hesap analizi varsayılan olarak gizli kalmalı.
6. **Evidence over hype:** İSPATLA, virallik veya gelir garantisi vermemeli. Tahminleri, gerçekleşen sonuçları ve belirsizlikleri birbirinden ayırmalı.
7. **Safety preservation:** Mevcut V3'ün OAuth, kullanıcı izolasyonu, yayın onayı, iş kuyruğu ve özerklik korumaları korunmalı.

Mevcut V3 sistemi silinmeyecek veya yeniden yazılmayacak. Değişiklikler geriye dönük uyumlu migration ve küçük modüllerle yapılacak.

---

# 2. Authentication V4

## 2.1. Kayıtta e-posta doğrulaması zorunlu olmayacak

Şu an Better Auth `requireEmailVerification` koşulunu private beta ayarına bağlıyor.

Yeni davranış:

- Kullanıcı e-posta ve şifreyle kayıt olabilir.
- Kayıt sırasında e-posta onayı istenmez.
- Hesap oluşturulur ve kullanıcı oturum açabilir.
- Dashboard içerisinde e-posta doğrulama seçeneği bulunur.
- Doğrulanmamış e-posta hesap güvenliği sayfasında belirtilir.
- Kullanıcı istediği zaman doğrulama mesajı gönderebilir.
- Doğrulama tamamlandığında durum güncellenir.

Arayüz örneği:

**Hesap güvenliği**

E-posta adresi  
`example@gmail.com`

Durum: Doğrulanmamış

`[E-postamı doğrula]`

Doğrulama bağlantısı tek kullanımlık olmalı, zaman aşımına uğramalı ve istekleri rate-limit edilmelidir.

E-posta doğrulaması isteğe bağlı olsa bile şifre sıfırlama, hassas hesap kurtarma ve e-posta değiştirme işlemleri için ilgili adrese sahipliğin doğrulanması gerekir.

## 2.2. E-posta kalitesi kontrolü

Önceki anti-abuse araştırmasını mevcut kayıt sistemine entegre et.

Kontroller:

- Syntax ve domain biçim doğrulaması.
- DNS MX kontrolü.
- Null MX ve geçersiz domain tespiti.
- Disposable e-posta blocklist kontrolü.
- Bilinen geçici mail servislerinin MX altyapısıyla eşleştirme.
- Sağlayıcıya özel güvenli e-posta normalizasyonu.
- Kayıt hızının izlenmesi.

Açık kaynak referanslar:

- `disposable/disposable`
- `reacherhq/check-if-email-exists`
- `validatorjs/validator.js`
- `fingerprintjs/fingerprintjs`
- `altcha-org/altcha`

SMTP probing zorunlu kayıt kontrolü yapılmayacak. Catch-all sunucular ve gizlilik korumaları nedeniyle posta kutusunun gerçekten var olduğunu kesin olarak kanıtlamaz.

DNS timeout ve geçici hatalarda kayıt akışı gereksiz yere bloke edilmemeli.

## 2.3. Multi-account ve Sybil koruması

Sistemin amacı bütün çoklu hesapları kesinlikle tespit etmek değil, sahte hesap açılmasının getirilerini sınırlamak.

Risk sinyalleri:

- Hızlı ardışık hesap oluşturma.
- Aynı e-posta kimliğinin yeniden kullanılması.
- Aynı X kullanıcı ID'sinin farklı İSPATLA hesaplarına bağlanması.
- İmzalı, birinci taraf cihaz çerezi.
- Opsiyonel FingerprintJS.
- IP ve ağ kaynaklı kısa süreli hız sinyalleri.
- Önceden yaptırım uygulanmış hesaplarla güçlü ilişkiler.

Uygulama:

- Hesap ilişki analizini ayrı bir abuse modülünde tut.
- Fingerprint eşleşmesini kesin kimlik kanıtı sayma.
- Gizlilik korumalı tarayıcılara ve VPN/Tor kullanıcılarına sırf bu nedenle yaptırım uygulama.
- Rate limiting için merkezi ve üretim ortamına uygun depolama kullan.
- Gerekirse ALTCHA challenge uygula.
- Yanlış pozitiflere karşı destek/inceleme mekanizması oluştur.
- Risk kayıtları için veri saklama süresi ve silme politikası tanımla.

Önemli: Aynı X hesabı normalde aynı anda iki bağımsız İSPATLA kullanıcısına ait olamamalı. Bu kontrol fingerprint'ten daha güvenilir bir kimlik eşleştirmesidir.

---

# 3. X ile giriş ve kayıt

## 3.1. Mevcut OAuth'u koru

Projede X OAuth 2.0 PKCE zaten bulunuyor.

Mevcut uygulamanın session-bound OAuth transaction, state, PKCE, refresh token rotation, sahiplik kontrolü ve token şifreleme özellikleri korunacak.

Yeni özellik bunların yerine yazılmamalı.

## 3.2. İki ayrı OAuth amacı

**A. Sign in with X**

- Kullanıcı X ile kayıt olur veya giriş yapar.
- X `/2/users/me` üzerinden doğrulanmış X kullanıcı ID'si alınır.
- Daha önce eşleştirilmiş bir İSPATLA kimliği varsa o kullanıcıya giriş yapılır.
- İlk kez geliyorsa yeni İSPATLA hesabı oluşturulur.
- Uygulama oturumu Better Auth tarafından yönetilir.

**B. Connect X Account**

- Oturum açmış kullanıcı X hesabını İSPATLA'ya bağlar.
- Hesap analizi ve izin verilen X işlemleri için ayrı yetkiler talep edilir.
- Bağlanan hesap kullanıcıya ait bir kaynak olarak kaydedilir.

Bu iki akış ayrı olmalı.

X ile giriş yapmak, tweet yayınlamaya otomatik izin verilmesi anlamına gelmez.

## 3.3. Least-privilege izinler

İlk girişte mümkün olan en düşük kapsamlı izinler istenecek.

Yayınlama, medya yükleme ve refresh token gibi daha güçlü yetkiler yalnızca ilgili özellik kullanılacağı zaman, yeni bir onay akışıyla istenecek.

X API'nin güncel scope ve uygulama izinleri doğrulanacak. Yetkilerin kullanılabilir olmadığı durumlarda arayüz yanlış vaatlerde bulunmayacak.

## 3.4. Account linking

Kullanıcı e-posta ile açtığı hesabı sonradan X ile ilişkilendirebilir.

X ile kayıt olan kullanıcı sonradan e-posta ve şifre ekleyebilir.

- Aynı X kimliği iki kullanıcıya otomatik bağlanmaz.
- Hesap birleşmeleri açık onay ve kimlik doğrulaması gerektirir.
- X'in e-posta vermediği durumlarda sahte e-posta üretilmez.
- X'ten gelen handle değil, değişmeyen X kullanıcı ID'si temel kimlik olarak kullanılır.
- OAuth callback replay ve session confusion testleri korunur.

---

# 4. Automatic Category Intelligence

Bu değişiklik en yüksek öncelikli kullanıcı deneyimi iyileştirmelerinden biridir.

## 4.1. Problem

Mevcut İSPATLA'da farklı kullanıcı hesapları için kategorileri manuel oluşturmak ciddi sürtünme yaratıyor.

Yeni kullanıcı X hesabını bağladıktan sonra kendi nişini belirlemek ve kategorileri tek tek girmek zorunda kalmamalı.

## 4.2. Hedef

Kullanıcı X hesabını bağlar.

İSPATLA izin verilen profil ve hesap verilerini inceler.

Sistem otomatik olarak:

- Hesabın ana içerik alanlarını,
- Alt konularını,
- İçerik dilini,
- Genel üslubunu,
- Takipçilerin ilgi gösterebileceği konu kümelerini,
- Hesaba uygun içerik formatlarını

önerir.

## 4.3. Analiz kaynakları

Yalnızca gerçekten erişilebilir verilere dayan:

- X biyografisi.
- Görünen ad ve kullanıcı adı.
- Hesabın kendi geçmiş gönderileri.
- İzin verilen etkileşim ve performans metrikleri.
- Kullanıcının açıkça sağladığı bilgiler.
- Kullanıcı tarafından onaylanan içerik tercihleri.

X API'nin erişim vermediği takipçi ilgi alanları veya özel veriler hakkında uydurma çıkarımlar üretme.

Veri yetersizse kullanıcıya birkaç basit soru sorulabilir. Bu sorular zorunlu olmamalı.

## 4.4. Otomatik kategori oluşturma

Örnek X hesabı:

Biyografi: `AI, Linux, Open Source, Software Engineering`

İSPATLA önerileri:

- Artificial Intelligence
- Open Source
- Linux
- Software Development
- AI Agents

Arayüz:

**Senin için hazırladığımız konular**

Her kategori bir chip/card olarak görünür.

Kullanıcı:

- Kategoriyi kaldırabilir.
- Yeni kategori ekleyebilir.
- Önem sırasını değiştirebilir.
- Kategoriye ağırlık verebilir.
- Öneriyi yeniden oluşturabilir.

Tek aksiyon: **Konularımı kullan**

Kullanıcının açıkça onayladığı kategoriler, sonraki analizlerde izinsiz üzerine yazılmamalı.

## 4.5. Mimari

Mevcut kategori sistemi korunmalı; yeni `AccountCategoryInferenceService` eklenmeli.

Önerilen veri modeli:

`account_category_inferences`

- id
- owner_user_id
- x_account_id
- category_id
- confidence
- evidence
- model_id
- prompt_version
- inference_version
- suggested_at
- accepted_at
- rejected_at

Ayrıca kategori kaynağı tutulmalı:

- `manual`
- `inferred`
- `imported`

Kullanıcı tarafından değiştirilmiş kategorilere AI otomatik müdahale etmemeli.

Bağlama işlemi tamamlandığında idempotent background job oluştur.

Aynı OAuth callback veya worker retry ikinci kategori kümesi üretmemeli.

---

# 5. JSON yerine gerçek Settings UX

## 5.1. Problem

İSPATLA'nın mevcut altyapısında gelişmiş ayarlar ve politika yapılandırmaları bulunuyor. Bunların ham JSON ile düzenlenmesi sıradan kullanıcı için uygun değil.

JSON tamamen kaldırılmayacak; kullanıcıya gösterilen varsayılan arayüz değişecek.

## 5.2. Yeni ayar yapısı

Ayarlar şu bölümlere ayrılacak:

**Hesaplar**
- Bağlı X hesapları
- Hesap durumu
- Yeniden bağlama
- Yetki yönetimi

**İçerik tercihleri**
- Konular
- Diller
- Ton
- Kaçınılacak konular
- İçerik türleri

**AI**
- Sağlayıcı
- Model
- API anahtarları
- Harcama limitleri
- Bağlantı testi

**Otomasyon**
- Observe / Assist / Off
- Hesap başına izinler
- Yayın onayları
- Sıklık ve zamanlama

**Güvenlik**
- E-posta doğrulama
- Oturumlar
- Şifre
- Bağlı kimlikler

**Profil**
- Kullanıcı adı
- Avatar
- Biyografi
- Görünürlük
- Hit paylaşımı

**Dil ve görünüm**
- Dil
- Tema
- Hareket azaltma
- Erişilebilirlik

## 5.3. UX bileşenleri

Mevcut shadcn/Base UI yapısını kullan.

Uygun alanlarda:

- Segmented controls
- Switch
- Combobox
- Searchable multi-select
- Sliders
- Reorderable category chips
- Contextual help
- Inline validation
- Preview cards
- Save/discard
- Undo
- Reset to default

Karmaşık ayarların altında teknik JSON değil, anlaşılır açıklamalar olmalı.

Örneğin:

**İçerik tonu**

Profesyonel — Dengeli — Samimi — Mizahi

**Risk toleransı**

Düşük — Orta — Yüksek

Bu kontrollerin tam olarak hangi backend politikasını değiştirdiği açık ve deterministik biçimde tanımlanmalı.

Güvenlik açısından önemli kurallar belirsiz bir slider değerinden çıkarılmamalı.

## 5.4. Advanced mode

İleri düzey kullanıcılar için JSON editörü bulunabilir.

- Varsayılan olarak gizli.
- JSON Schema ile doğrulanan.
- Değişiklik öncesi diff gösteren.
- Geri alma desteği bulunan.
- Sürüm bilgisi taşıyan.
- Geçersiz politika kaydetmeyen.

Arayüz ve JSON aynı kanonik veri modelini kullanmalı.

---

# 6. Production BYOK ve Codex

## 6.1. Mevcut durum

`src/server/ai.ts` şu üç sağlayıcıyı destekliyor:

- `api`
- `compatible`
- `codex`

Mevcut Codex desteği sunucudaki CLI executable ve yerel authentication durumuna dayanıyor.

Bu yöntem tek kullanıcılı geliştirme ortamında anlamlı olabilir; fakat çok kullanıcılı bir SaaS'ın genel AI giriş kapısı olarak uygun değildir.

## 6.2. BYOK yaklaşımı

Her kullanıcının ayrı AI provider yapılandırması olmalı.

Tercih edilen production modları:

**OpenAI API key**

Kullanıcı kendi OpenAI API anahtarını bağlar.

İSPATLA bu anahtarı sadece kullanıcıya ait AI istekleri için kullanır.

**OpenAI-compatible API**

Kullanıcı uygun sağlayıcının endpoint'ini ve API anahtarını girer.

**Codex-capable model**

Kullanıcı Codex odaklı bir modeli, resmi API üzerinden erişimi varsa, kendi OpenAI API anahtarıyla kullanabilir.

Codex CLI ile ChatGPT abonelik oturumunu üçüncü taraf web ürününün ortak yetki mekanizması haline getirme.

ChatGPT aboneliği ile API faturalandırmasını aynı şeymiş gibi sunma.

## 6.3. Production security

API anahtarları:

- Kullanıcı sahipliğiyle kaydedilmeli.
- Server-side AES-256-GCM ile şifrelenmeli.
- Kullanıcının tarayıcısına geri gönderilmemeli.
- Log ve hata mesajlarından çıkarılmalı.
- Anahtar rotasyonunu desteklemeli.
- Silindiğinde sonraki işlerde kullanılmamalı.

Mevcut vault kodu ve owner isolation denetlenip kullanılmalı.

Kullanıcıya özel key olmadan server global key'ine otomatik fallback yapılmamalı.

Custom base URL'ler SSRF riskine karşı doğrulanmalı.

Sınırsız özel host veya private network hedeflerine backend bağlantısı açılmamalı.

## 6.4. AI provider interface

Tek bir soyutlama oluştur:

`AIProviderAdapter`

Operasyonlar:

- `generateDraft`
- `scoreOpportunity`
- `analyzeAccount`
- `inferCategories`
- `evaluateDraft`
- `testConnection`

Her istek şu bağlamı taşır:

- owner_user_id
- provider_id
- model_id
- task_type
- account_id
- request_id
- budget
- timeout

Model yetenekleri doğrulanmalı. Bütün modellerin aynı JSON Schema, tool calling veya reasoning desteğine sahip olduğu varsayılmamalı.

## 6.5. Kullanıcı arayüzü

AI sayfasında sağlayıcı kartları:

**OpenAI**
API key bağla

**OpenAI-compatible**
Kendi endpoint'ini kullan

**Codex models**
Desteklenen API modelleri ve mevcut erişim durumunu göster

Her sağlayıcı için:

- Bağlı / bağlı değil
- Model seçimi
- Bağlantıyı test et
- Tahmini kullanım maliyeti
- Kullanım geçmişi
- Günlük limit
- Anahtarı kaldır

Resmi olmayan, diğer kullanıcıların ChatGPT oturumlarını ele geçiren veya abonelik yetkisini taklit eden çözümler kullanılmayacak.

---

# 7. Global i18n — 20 dil

## 7.1. Hedef

İSPATLA dünya genelinde kullanılabilecek şekilde geliştirilecek.

Native i18n; yalnızca metin çevirisi değil, tarih, sayı, saat, çoğul ifadeler, RTL, metin uzunluğu ve SEO metadata yerelleştirmesini kapsamalı.

## 7.2. İlk 20 dil

Konuşur sayısı ve ürünün hedef pazarı birlikte dikkate alınarak önerilen ilk dağıtım:

| Kod | Dil |
|---|---|
| en | English |
| zh-CN | Simplified Chinese |
| hi | हिन्दी |
| es | Español |
| fr | Français |
| ar | العربية |
| bn | বাংলা |
| pt-BR | Português |
| ru | Русский |
| id | Bahasa Indonesia |
| ur | اردو |
| de | Deutsch |
| ja | 日本語 |
| sw | Kiswahili |
| mr | मराठी |
| te | తెలుగు |
| tr | Türkçe |
| ta | தமிழ் |
| vi | Tiếng Việt |
| ko | 한국어 |

Bu bir konuşur sayısı sıralaması değil, 20 dilli ürün dağıtım önerisidir. Tamamen istatistiksel bir ilk 20 isteniyorsa kullanılan Ethnologue sürümüne ve makrodil sınıflandırmasına göre ayrıca sabitlenmelidir.

Türkçe, ürünün mevcut kimliği nedeniyle korunacaktır.

## 7.3. Teknik yapı

Next.js App Router ile uyumlu, `next-intl` gibi olgun bir i18n çözümü değerlendir.

Önerilen URL:

- `/tr`
- `/en`
- `/es`
- `/de`

Dil kodu olmayan mevcut linkler uyumlu yönlendirmelerle çalışmaya devam etmeli.

Çeviri dosyaları namespace mantığında düzenlenmeli:

- common
- auth
- dashboard
- accounts
- opportunities
- drafts
- settings
- profile
- analytics
- errors

## 7.4. İçerik dili ve arayüz dili ayrımı

Kullanıcının İSPATLA arayüzünü İngilizce kullanması, X taslaklarının İngilizce olması gerektiği anlamına gelmez.

Ayrı alanlar:

- `interface_locale`
- `content_locale`
- `account_preferred_locales`

AI çıktıları hesap tercihine göre üretilmeli.

Dil tespiti güvenilir değilse kullanıcı tercihi öncelikli olmalı.

## 7.5. Kalite

- Arapça ve Urduca için RTL.
- Doğru pluralization.
- ICU message format.
- Locale-aware tarih ve sayı formatları.
- Font fallback ve karakter desteği.
- Pseudo-localization testleri.
- Eksik anahtar tespiti.
- SEO hreflang/canonical.
- Locale bazlı metadata.
- Ekran okuyucu kontrolleri.

Makine çevirisi taslak olarak kullanılabilir ancak yayın kalitesinde çevirilerin kontrol edilmesi gerekir.

---

# 8. İSPATLA içi profil ve hit sistemi

## 8.1. Kullanıcı profili

Yeni public route:

`/u/[username]`

Her kullanıcının kendi profili olur.

Alanlar:

- Profil fotoğrafı.
- Kullanıcı adı.
- Biyografi.
- Bağlı X hesabı bilgisi.
- Uzmanlık/ilgi kategorileri.
- Hesap oluşturulma tarihi.
- İsteğe bağlı bağlantılar.
- Herkese açık hit geçmişi.
- Performans istatistikleri.

Varsayılan profil gizli olmalı. Kullanıcı yayınlamayı açıkça seçmeli.

Kullanıcı X bağlantısını kaldırdığında profilin nasıl davranacağı belirlenmeli.

## 8.2. Hit tanımı

İSPATLA'da bir gönderinin başarılı olması tek bir beğeni sayısına indirgenmemeli.

Saklanabilecek ölçümler:

- Views, veri erişilebiliyorsa.
- Likes.
- Replies.
- Reposts.
- Quotes.
- Engagement rate.
- Hesabın kendi tarihsel ortalamasına göre performans.
- Yayından sonra geçen süre.
- İSPATLA'nın öneri ve taslak katkısı.

Önemli ayrım:

- İSPATLA tarafından taslak oluşturulmuş.
- İSPATLA üzerinden onaylanıp yayınlanmış.
- Sonucu resmi veriyle doğrulanmış.

Bu üç farklı durum birbirine karıştırılmamalı.

## 8.3. Hit paylaşımı

Kullanıcı kendi başarılı gönderisini paylaşılabilir bir karta dönüştürebilmeli.

Örnek:

**İSPATLA Hit Card**

X hesabı: @example

Gönderi: `AI agents are changing...`

Görüntülenme: 42.1K  
Beğeni: 1.2K  
Normal performansa göre: 3.4×

Durum: Resmi verilerle doğrulandı

Kullanıcı kartı X'te paylaşabilir veya link gönderebilir.

Kartta doğrulanmamış metrikler kesin veri gibi gösterilmez.

## 8.4. Leaderboard

Yeni route:

`/leaderboard`

Sekmeler:

- Haftanın hitleri
- Ayın hitleri
- En iyi hesap performansı
- En çok gelişen kullanıcılar

Sıralama salt görüntülenme toplamı yerine hesap boyutunu ve verinin güvenilirliğini dikkate almalı.

Büyük hesapların küçük hesapları otomatik ezmemesi için ayrı kategoriler ve normalleştirilmiş metrikler kullanılabilir.

Minimum veri eşiği olmalı.

Spam, koordineli etkileşim ve sahte metrik şüphesi bulunan kayıtlar leaderboard'da avantaj sağlamamalı.

Kullanıcı katılımı tamamen opt-in olmalı.

## 8.5. Public share pages

Örnek:

`/h/[publicId]`

Özellikler:

- Open Graph görüntüsü.
- Kaynak X gönderisine bağlantı.
- Güncelleme zamanı.
- Veri doğrulama durumu.
- Paylaşım kontrolü.
- Kaldırma seçeneği.

Public ID rastgele ve tahmin edilmesi zor olmalı.

Özel taslaklar ve dahili AI analizleri hiçbir şekilde public endpoint üzerinden sızmamalı.

---

# 9. Emotional Design ve kirpi maskot

## 9.1. Marka

İsim: **İSPATLA**  
Domain: **ispatla.tr**  
Ürün kategorisi: **Social AI HitMaker**

Ürün dili kendinden emin, modern ve anlaşılır olmalı.

Bilimsel doğrulama ve sosyal medya dinamizmi marka karakterinin iki ana teması.

## 9.2. Maskot

Özgün bir kirpi karakter tasarlanacak.

Tasarım özellikleri:

- Basit geometrik silüet.
- Yuvarlak gövde.
- Az sayıda belirgin diken.
- Büyük ve okunabilir gözler.
- Kısa burun.
- Samimi ama aşırı çocukça olmayan ifade.
- Küçük boyutta tanınabilir.
- Tek renk silüette ayırt edilebilir.
- 24×24 ikon boyutunda anlaşılabilir.

Duolingo'dan doğrudan karakter, renk düzeni veya biçim kopyalanmayacak.

Referans alınacak şey karakterin sadeliği, ifadesi ve farklı durumlara adapte edilebilirliği.

## 9.3. GPT Image üretim süreci

Önce özgün ana karakter konsepti üret.

Ardından:

- Primary mascot
- Simplified logo
- Favicon
- Empty-state mascot
- Success mascot
- Thinking mascot
- Error mascot
- Onboarding mascot
- Hit celebration mascot

Karakterin yüz ve gövde oranları sürümler arasında sabit kalmalı.

Görsel üretim sonucunu temel alan, elle temizlenmiş SVG ikon sistemi hazırlanmalı.

AI çıktıları doğrudan favicon olarak kullanılmadan önce küçük boyut testi ve görsel sadeleştirme yapılmalı.

## 9.4. Kullanım alanları

**Onboarding**

Kirpi kullanıcıyı karşılar ve ilk kategorilerin hazırlanması sürecini anlatır.

**Boş durumlar**

Henüz içerik fırsatı bulunmadığında açıklayıcı bir durum gösterir.

**Başarılı hit**

Gerçekten doğrulanmış başarılı bir sonuç olduğunda küçük bir kutlama animasyonu gösterir.

**Hata**

Başarısızlıkta kullanıcıyı suçlamadan, anlaşılır çözüm sunar.

**Loading**

Kirpinin düşünme varyasyonu kullanılabilir.

Animasyonlar kısa, ölçülü ve `prefers-reduced-motion` uyumlu olmalı.

## 9.5. Tasarım sistemi

Mevcut shadcn/Tailwind altyapısı korunacak.

Görsel ilkeler:

- Güçlü tipografik hiyerarşi.
- Yeterli whitespace.
- Tutarlı border radius.
- Hafif ve amaçlı hareket.
- Dark/light tema uyumu.
- Belirgin ama abartısız marka rengi.
- Mobil kullanım önceliği.
- Klavye erişilebilirliği.
- WCAG uyumuna yönelik testler.

Aşırı gradient, rastgele glassmorphism, her yerde glow, gereksiz kartlar ve anlamsız animasyonlardan kaçın.

Emotional design, ürünün kullanılabilirliğine hizmet etmeli.

---

# 10. Yeni onboarding akışı

Hedef: İlk kullanıcı deneyimini mümkün olduğunca kısa tutmak.

### Adım 1: Kayıt

Seçenekler:

- X ile devam et
- E-posta ile kayıt ol
- Zaten hesabım var

E-posta doğrulaması zorunlu değildir.

### Adım 2: X hesabını bağla

Kullanıcıya neden X bağlantısı istendiği açıklanır.

İstenen yetkiler ve bunların amacı gösterilir.

### Adım 3: Hesabını tanıyalım

İSPATLA izin verilen verileri analiz eder.

Kategori, dil ve ton önerileri oluşturulur.

### Adım 4: Tercihleri onayla

Kullanıcı kategorileri ve üslubu düzenler.

Tek butonla devam eder.

### Adım 5: İlk fırsatın

Sistem gerçek kaynak ve hesap uyumu verisiyle ilk fırsatı gösterir.

Henüz yeterli veri yoksa bunu açıkça belirtir.

İlk taslak, uygun AI sağlayıcısı bağlanmışsa hazırlanır.

### Adım 6: Dashboard

Kullanıcı kendi hesabına özel kontrol odasına ulaşır.

Hiçbir adım otomatik yayın izni anlamına gelmez.

---

# 11. Dashboard V4

Ana sayfa teknik metriklerle dolu bir operatör paneli gibi görünmemeli.

Öncelikli alanlar:

**Senin için fırsatlar**

Kullanıcının hesap konularına uygun içerikler.

**Taslakların**

Hazırlanan veya inceleme bekleyen içerikler.

**Sonuçların**

Gerçek yayınlardan gelen performans verileri.

**Hesabının gelişimi**

Tarihsel eğilimler ve öğrenilebilir çıkarımlar.

**AI ve hesap durumu**

Bağlantı eksikliği veya kullanıcının çözmesi gereken sorunlar.

Gelişmiş analiz, değerlendirme ve worker detayları ayrı alanlarda kalmalı.

---

# 12. Teknik mimari

Mevcut Next.js 16, React 19, Better Auth, SQLite, Bun ve shadcn stack korunacak.

Öncelik mevcut sistemin güvenli refactor edilmesi.

Yeni mantıksal modüller:

- `IdentityService`
- `EmailValidationService`
- `AbuseRiskService`
- `AccountInferenceService`
- `UserPreferencesService`
- `AIProviderRouter`
- `ProfileService`
- `HitVerificationService`
- `LeaderboardService`
- `LocalizationService`

Veritabanı değişiklikleri migration ile yapılacak.

Yeni tablolarda ve API'lerde `owner_user_id` izolasyonu korunacak.

Public profiller ile private kullanıcı verileri kesin şekilde ayrılacak.

Dashboard sorguları başka kullanıcıların taslaklarını, sırlarını veya yayın izinlerini göremeyecek.

Worker retry işlemleri idempotent olacak.

Mevcut V3 onay snapshot'ları, final send guard, consent ve lease mekanizmaları atlanmayacak.

---

# 13. Uygulama sırası

## P0 — Kimlik ve güvenlik

- E-posta doğrulamasını kayıt sırasında opsiyonel hale getir.
- Dashboard içi e-posta doğrulamasını ekle.
- Disposable/DNS ve kayıt rate limit kontrollerini ekle.
- X ile giriş ve kayıt akışını bağlama akışından ayır.
- Account linking ve ownership çakışmalarını çöz.
- Auth regression testlerini tamamla.

## P1 — Sıfır ayarlı kişiselleştirme

- Account inference job.
- Otomatik kategori önerileri.
- Kullanıcı onayı.
- Kategori öncelikleri.
- Başlangıç tercihlerinin oluşturulması.
- İlk fırsat onboarding'i.

## P2 — Settings UX

- JSON ayarlarını tipli kontrollere dönüştür.
- Yeni ayar navigasyonu.
- Inline validation.
- Save/undo/reset.
- Advanced JSON mode.
- Mobil ve erişilebilirlik testleri.

## P3 — Production BYOK

- Kullanıcıya özel provider ayarları.
- Vault izolasyonu.
- Model capability kontrolü.
- Codex CLI production bağımlılığını kaldır veya yalnızca self-hosted operator modunda tut.
- Per-user usage/budget.
- SSRF ve secret leakage testleri.

## P4 — Profiller ve hitler

- Profil sistemi.
- Opt-in public görünürlük.
- Doğrulanmış hit kartları.
- Public share pages.
- Leaderboard.
- Abuse ve yanlış metrik kontrolleri.

## P5 — Marka ve i18n

- Kirpi maskot konsepti.
- SVG ikon ailesi.
- Landing page refactor.
- Emotional design.
- 20 dil için i18n altyapısı.
- Çeviri kalite kontrolleri.
- RTL.
- Metadata ve SEO.

İ18n altyapısı erken kurulmalı; 20 dilin içerik ve QA çalışmaları aşamalı tamamlanmalı.

---

# 14. Acceptance criteria

Tamamlandı sayılması için:

- Kullanıcı e-posta doğrulamadan kayıt olabilir ve oturum açabilir.
- Sonradan e-postasını doğrulayabilir.
- E-posta doğrulaması şifre kurtarma güvenliğini bozmaz.
- Aynı X kimliği farklı kullanıcılara sessizce atanmaz.
- X login ile X publishing consent birbirinden ayrıdır.
- X bağlantısından sonra kategori önerileri otomatik hazırlanır.
- Kategoriler kullanıcı tarafından düzenlenebilir.
- JSON bilmeden bütün temel ayarlar yapılabilir.
- Her kullanıcı kendi AI anahtarını güvenli biçimde kullanabilir.
- Sunucunun ortak Codex CLI oturumu kullanıcılar arasında paylaşılmaz.
- Arayüz ve içerik dili birbirinden bağımsız çalışır.
- 20 dilde eksik anahtar, layout ve RTL kontrolleri yapılır.
- Profil varsayılan olarak gizlidir.
- Hit paylaşımı opt-in çalışır.
- Leaderboard yalnızca yeterli kanıta sahip metrikleri kullanır.
- Mascot küçük boyutta okunabilir ve tutarlı bir tasarıma sahiptir.
- Mevcut V3 güvenlik kontrolleri ve regression testleri bozulmaz.
- Gerçek X OAuth, mail gönderimi ve yayın entegrasyonları ayrı live acceptance testlerinden geçirilir.

# 15. Codex için çalışma talimatı

Önce mevcut kodu incele; hangi özelliklerin zaten mevcut olduğunu belirle.

Yeni implementasyonlarda önce var olan modülleri genişlet, gereksiz sistem tekrarı yapma.

Mevcut V3 master planını ve implementation status belgesini referans al.

Yüksek riskli auth, OAuth, provider, owner isolation veya yayın değişikliklerinde ayrı regression testleri yaz.

Mevcut kayıtları kıracak migration uygulama.

Geri alınabilir, gözlemlenebilir ve test edilebilir küçük değişikliklerle ilerle.

Mevcut testlerde başarılı olmak ile production'da canlı servislerin gerçekten çalıştığını kanıtlamayı birbirinden ayır.

**Nihai hedef:** Kullanıcının X hesabını bağlayıp konularının otomatik tanımlandığı, ilk fırsatını gördüğü, kendi AI altyapısıyla taslak üretebildiği ve gerçek başarılarını isteğe bağlı paylaşabildiği bir İSPATLA oluşturmak.
