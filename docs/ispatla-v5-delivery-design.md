# ISPATLA V5 — uygulanacak kapsam ve kabul kanıtı

11 Ekim 2026. Kaynak: kullanıcının eklediği konuşmanın son kararları ve mevcut temiz `main` çalışma ağacının kaynak kodu denetimi. Bu belge uygulama tamamlandı iddiası değildir.

## Ürün sonucu

Hedef durumda X OAuth sunucuda ve arayüzde kapalı olacak. Kullanıcı e-posta/şifre ile giriş yapacak, bir X handle ekleyecek; erişilebilir herkese açık içeriklerden kategori ve yazı tarzı otomatik oluşturulacak. Handle eklemek sahiplik sağlamaz. Kullanıcı bio challenge ile doğruladığı hesabı kişisel kimliği olarak kullanabilir. Mevcut X kullanıcılarının oturumları ve tarihsel kayıtları korunur; gerçek e-posta ve parola geçişi sağlanır.

Gönderiye tıklamak `/post/{id}` adresinde ISPATLA inceleyicisini açar. Akıştan açılış masaüstünde modal, mobilde tam ekran görünüm; doğrudan URL ve yenileme tam sayfa görünüm üretir. Geri ve ileri gezinme korunur. Açıkça etiketlenmiş ikincil `𝕏'te aç` eylemi kalabilir.

Fırsatlar, dashboard, hesaplar, kategori/tarz, taslaklar, kuyruk ve kaynak ekranları mevcut shadcn Base UI bileşenleri ile sadeleştirilir. Bilinmeyen veya uygulanmamış veriler sıfır ya da çalışır özellik olarak gösterilmez. MCP web ile aynı kullanıcı kapsamlı servisleri kullanır; ajan bir boolean göndererek insan yayın onayı veremez.

## Güncel koddan doğrulanan farklar

- `postgres-profile-dashboard.ts` bütün dashboard sayaçlarını sabit sıfır döndürüyor. `dashboard.ts` AI/otomasyon durumlarını ve taslak listesini sabitliyor.
- `/api/accounts` POST OAuth dışındaki eklemeyi 422 ile reddediyor. `account-inference.ts` resmî X tokenına bağlı.
- `XProfile` sabit X ID'yi kaybediyor; FXTwitter cursor, uygulama hata kodu ve dönen kimlik doğrulaması ortak reader'da ele alınmalı.
- `accounts.handle` ve `accountKey` global unique. Aynı hesabın birden fazla kullanıcı tarafından incelenebilmesi için owner kapsamında ilişki gerekiyor.
- Kategori `source`/`userModifiedAt` koruması zaten var. Otomatik konu keşfinin manual yazar üzerinden kaydedilmesi düzeltilmeli. Voice için manuel değişiklik kaynağı korunmalı.
- X provider secret varsa etkinleşiyor. Sentetik `x-{id}@users.ispatla.invalid` adresi gerçek kurtarma adresi değil; doğrulanmış olarak işaretlenmiş olması geçiş için yeterli kanıt değil.
- `monitoring.ts` PostgreSQL kaynak taramasını zaten uyguluyor. Market'in `scanAvailable:false` bilgisi güncel değil.
- `getPostgresAnalytics` gerçek özet döndürüyor. MCP analitik stub'ı bu servise bağlanabilir.
- MCP queue `confirm:true` ile `approvePublicationIntent` çağırıyor. Ajan insan onayı üretmiş oluyor; sunucu sınırında engellenmeli.
- Paylaşım dispatch politika kilidi mevcut. Yeni kullanıcı onaylı yöntemler eklenirken otomatik yayın kilidi korunmalı.
- `observed_posts` ortak public önbellek; taslaklar ve hesap ilişkileri owner kapsamlı. Viewer ortak kayıttaki draft alanlarını kullanıcıya aitmiş gibi gösteremez.

## Tasarım kararları

### 1. Kimlik ve otomatik analiz

Mevcut accounts, kategori ve voice motorları yeniden kullanılır. Hesap ilişkisi kullanıcı + sabit X ID ile oluşturulur; handle değişebilir profil alanıdır. Global benzersizlik yalnız doğrulanmış sahiplik için kullanılır. Tarihsel OAuth kimlikleri silinmez ve unverified handle eklemeyle değiştirilemez.

Bağlantı sonrası tek sınırlı veri toplama profili ve özgün gönderileri getirir, tekrarları ayıklar, kategori ve voice motorlarını besler. Yetersiz veri partial durum üretir. Önce deterministik analiz uygulanır; yeni AI çağrısı zorunlu değildir. Manuel kategori, manuel primary, devre dışı bırakılan eşlemeler ve elle düzenlenen voice/style alanları korunur. Yeniden analiz aynı servisi kullanır. Hassas kişilik/din/siyasi kimlik çıkarımı üretilmez.

Sahiplik challenge'ı rastgele, süreli ve tek kullanımlı; doğrulama taze profil okuması ve sabit ID eşleşmesi ister. Transaction ve global doğrulanmış kimlik kısıtı yarışları engeller. Başka kullanıcının kaydı üzerinde işlem yapılamaz.

OAuth giriş ve linking uçları sunucuda kapanır. Mevcut aktif oturumdaki X kullanıcıları doğrulanmış gerçek e-posta + parola geçişini yapabilir. OAuth-only kullanıcının aktif oturumu yoksa yeni hesap oluşturmak veya yalnız handle doğrulamak eski ISPATLA hesabına erişim sağlamaz; sentetik adrese parola sıfırlama gönderilmez. Mevcut kullanıcıları kilitlemeden geçiş kabulü için önce kullanıcı kayıtları ve kullanılabilir kurtarma yöntemleri denetlenir. Kurtarma kanıtı bulunmayan eski hesaplar çözülmeden geçiş tamamlandı sayılmaz; bu durum ayrı bir yayın engelidir.

### 2. Viewer ve veri sınırı

Tek ID/URL yardımcısı yalnız geçerli sayısal X post ID kabul eder. Arbitrary source URL'ler yalnız güvenli X status olarak ayrıştırılabiliyorsa içeri taşınır. Kullanıcı giriş kontrolü layout yanında veri servisinde de uygulanır. `/post` proxy/robots/profile rezervasyonları güncellenir; public `/h` kanıtının ayrı erişim kuralı korunur.

Ortak gönderi bileşeni metin, author, tarih, güvenli medya, erişilebilir quote/reply/conversation, nullable metrikler ve kaynağın gözlem zamanını gösterir. Provider response ID'si istenen ID ile eşleşmelidir. Public önbellek yalnız public veri içerir; kullanıcı taslakları ve analizleri owner filtreli sorgulanır. Eski kayıtlar gözlem olarak etiketlenir. Görsel/video kaynakları mevcut HTTPS allowlist doğrulamasından geçer.

Normalize edilmiş ham snapshot nullable metrikleri korur. Eski default-zero kayıtları metrik kaynağı kanıtı yoksa bilinmeyen olarak gösterilir. Yeni gözlemler rich snapshot saklar. Her sayfa açılışı zorunlu provider çağrısı üretmez; süreli önbellek, sınırlı concurrency ve timeout kullanılır.

Next.js'in kurulu sürümündeki intercepting + parallel route kuralları kullanılır; slot default ve catch-all kapanış yolları eklenir. Mevcut Base UI dialog tabanlı Sheet yeniden kullanılır; ikinci primitive sistemi kurulmaz.

### 3. Paylaşım ve MCP

Web Intent, manuel URL ilişkilendirme ve X native scheduling yönlendirmesi ortak mevcut publication servisinde hazırlanır. Pencerenin açılması/kapanması yayın başarısı değildir. Native scheduling Web Intent'e belgelenmemiş zaman parametresi eklemez; kullanıcı X ekranında tamamlar. FXTwitter ile gözlenen receipt, resmî doğrulama ile aynı kanıt seviyesi sayılmaz. Author ID, metin/hedef sürümü ve duplicate kontrolleri yapılır.

X OAuth ve otomatik resmî yayın kapalı kalır. Kullanıcı çerezi, şifre veya TOTP toplama; tarayıcı otomasyonunu SaaS yayın yöntemi yapma kapsam dışıdır.

Yerel MCP önce ortak account analysis, publishing prepare/status ve gerçek analytics servislerini kullanır. `confirm:true` web onayını atlayamaz. Uzak `/mcp` ayrı ISPATLA yetkilendirmesi kullanır: kullanıcı consent, dar scopes, süreli authorization code + PKCE, resource/audience bağlı token, iptal, rate limit ve origin kontrolü. Global session cookie veya X tokenı uzak bağlantıya taşınmaz. Discovery ve token uçları olmadan route tek başına tamamlanma sayılmaz. SDK'nin kurulu HTTP/auth yetenekleri doğrulanarak kullanılır.

### 4. Arayüz ve temizlik

Mevcut `base-nova`, semantik renkler, Field/Input/Select/Checkbox, Card/Avatar/Badge, Tabs, Empty/Alert/Skeleton ve erişilebilir overlay'ler kullanılır. Akış hafif önizleme gösterir, ayrıntılar viewer'a taşınır. Hesap ekleme handle + analiz durumu ile başlar; gelişmiş kategori/style düzenleme isteğe bağlıdır. Desteklenen diller ve bare URL kuralı korunur.

Dashboard gerçek owner sorguları ve gerçek ayar/worker durumlarını kullanır. Market mevcut scanner'a bağlanır; score, momentum, confidence birbirine eşitlenmez. MCP gerçek servislerin yetenek ve partial sınırlarını açıkça döndürür.

Workspace Market ve Dashboard gözlemleri kullanıcının hesaplarına bağlı kaynaklarla sınırlandırılır. Ortak public post önbelleği depolama paylaşımı sağlar; kullanıcıya özel fırsat seçimi veya skor kanıtı sağlamaz. Public keşif akışı ileride ayrı bir ürün kararıdır ve bu değişikliğe eklenmez.

Silme kararı import/export ve caller analiziyle kanıtlanır. Kullanılan auth kontrolleri, provider uyumluluğu, fixture'lar ve yayın kanıtları körlemesine silinmez. Yeni soyut provider framework, dependency veya gelecekte kullanılacak config eklenmez.

## İş sahipliği ve uygulama sırası

1. Identity işçisi: auth geçişi/kapatma, reader, hesap ve analiz backend'i, ilgili migration ve odaklı testler. Ortak reader/schema değişiklikleri supervisor tarafından diğer işçilere duyurulur.
2. Viewer işçisi: post routes/components/url helper, korumalı slot, post link caller'ları ve viewer testleri. Auth/reader/schema/MCP'ye yazmaz.
3. Publishing/MCP işçisi: publication preparation/receipt, MCP ortak servis bağlantıları, uzaktan auth ve ilgili testler. Identity ve viewer dosyalarına yazmaz.
4. Supervisor: dashboard/market doğruluğu ve son arayüz entegrasyonu; çakışan şema/i18n/proxy değişikliklerini birleştirir. İlk işçiler tamamlandıktan sonra ayrı read-only security reviewer çalışır.

İlk dilim ortak veri ve identity sözleşmelerini netleştirir. Sonraki dilimler viewer, hesap akışı ve paylaşım/MCP'yi uygular. UI yenilemesi ve ölü kod temizliği ilgili dilimde yapılır; tüm kapsam tamamlanmadan hedef tamamlandı sayılmaz.

## Kabul kanıtı

| Gereksinim | Gerekli kanıt |
| --- | --- |
| X OAuth kapalı, mevcut kullanıcı geçişi | Provider/endpoint reddi, UI yokluğu, aktif oturum ve eski identity korunması; doğrulanmış gerçek e-posta/parola geçiş testi |
| Handle ekleme + sabit kimlik | Rename, provider ID mismatch, aynı hesabı farklı kullanıcıların analizi; owner sınırı testleri |
| Sahiplik | Expiry/replay/stale response, exact ID, concurrent claim ve unverified public identity reddi |
| FXTwitter | Gerçek şema örneklerine dayalı cursor.bottom, JSON code, 429/timeout, duplicate, nullable metric ve schema regression |
| Otomatik kategori/voice | Bağlantıdan başlatma, partial state, manual alanların ve disabled mapping'in korunması |
| Post viewer | Tüm post caller'ları iç URL; direct/reload/back/forward, mobil, medya hata, klavye/focus, owner analizi izolasyonu |
| Doğru dashboard/market | Nonzero fixture DB sonuçları, owner SQL parametreleri, missing ile zero ayrımı, scanner'ın gerçek sonucu |
| Paylaşım | Intent açılışı başarı sayılmaz; yanlış author/URL/sürüm ve duplicate receipt reddi; dispatch kilidi korunur |
| MCP | Unauthenticated/cross-owner reddi, confirm bypass reddi, ortak servis parity; remote consent/PKCE/audience/revoke sınırı |
| Shadcn ve temizlik | Dil regresyonu, render/mobile/browser kanıtı; silinen export'ların caller analizi |
| Genel | Typecheck, lint, `bun test --isolate`, build; ayrı read-only review ve kritik kanıtın supervisor tarafından tekrar üretimi |

Gerçek DB migration, provider erişimi, uzak MCP client handshake ve deployed browser davranışı yerel fixture/build kanıtından ayrı raporlanır. Push/merge/deploy bu belgeyle yapılmış sayılmaz.

## Yerel teslim doğrulaması — 11 Ekim 2026

Uygulama çalışma ağacında tamamlandı. Typecheck, lint, production build ve diff whitespace kontrolü geçti. Genel test koşusu 256 başarılı, 9 opt-in entegrasyon testi atlanmış ve sıfır başarısız sonuç verdi. Bu 9 test ayrıca izole PostgreSQL üzerinde çalıştırıldı ve tamamı geçti; tüm migration dosyaları aynı izole veritabanına uygulandı.

Entegrasyon kanıtı sahiplik yarışı ve tekrar kullanımı, manuel kategori/voice koruması, kullanıcı izolasyonu, receipt metin/hedef/author kontrolleri, PKCE ve token rotasyonu/iptali, gerçek HTTP MCP bağlantısı ve Origin reddini kapsar. Eski aktif X oturumunun doğrulanmış gerçek e-posta ve ilk parolaya geçişi de yerel mail fixture ile geçti. Bağımsız salt-okunur güvenlik incelemesinde kalan somut engel bulunmadı.

Yerel tarayıcıda giriş, viewer overlay, Escape ile geri dönüş ve focus, ileri gezinme, doğrudan yenileme, kaydetme, kaynak gönderiden taslak oluşturma ve 390 px mobil görünüm doğrulandı. Gerçek FXTwitter profil/timeline okuması ayrıca geçti; bu kanıt üretim ortamının hazır olduğunu göstermez.

**Canlı yayın engeli:** Yapılandırılmış canlı veritabanında yalnız toplu ve salt-okunur denetim yapıldı: 2 kullanıcı arasında gerçek kurtarma e-postası/parolası bulunmayan 1 eski X kullanıcısı var; aktif oturumu mevcut. Bu kullanıcı oturumu açıkken güvenlik ekranından gerçek e-postasını doğrulayıp parola oluşturmalı. Kurtarma geçişi tamamlanmadan OAuth'u kapatan sürüm canlıya alınmamalı.

Canlı veritabanı migration'ı, push/merge ve deployment yapılmadı. Üretimde MCP proxy/Origin davranışı ve tarayıcı akışı ayrıca doğrulanmalıdır. Hiçbir canlı kullanıcı e-postası, parolası veya kimlik kaydı bu çalışma kapsamında değiştirilmedi.
