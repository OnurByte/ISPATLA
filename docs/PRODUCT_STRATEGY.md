# İSPATLA — ürün, marka ve pazarlama teslimi

25 Ekim 2026. Kaynak: aynı tarihli kullanıcı handoff'u, güncel kaynak kodu ve aşağıda bağlantılı birincil araştırmalar. Bu belge A–H çıktılarının güncel merkezidir. 9 Ekim Signal Press belgeleri tarihsel kayıttır; güncel marka veya çalışan özellik kanıtı sayılmaz.

Durum sözlüğü: **KESİN KARAR** kullanıcı tercihi; **MEVCUT** kaynakta uygulanmış; **KISMİ** çalışan parçası bulunan fakat bütünü doğrulanmamış; **ÖNERİ** deney veya gelecek iş; **AÇIK KARAR** ürün sahibinin seçimi; **DOĞRULANMAMIŞ** canlı sonuç kanıtı bulunmayan iddia. Yerel test ve build, üretim doğrulaması değildir.

## A. Current State Audit

| Handoff alanı | Güncel durum | Kaynak / sınır |
| --- | --- | --- |
| X odaklı, farklı konu kategorileri | MEVCUT | `src/server/x-reader.ts`, `account-inference.ts`, `account-fit.ts`; başka sosyal ağ ürünü eklenmedi. |
| FxTwitter public okuma | MEVCUT | `x-reader.ts`: public profil/timeline/post okuma ve normalizasyon. Resmî X doğrulaması değildir. |
| Çoklu hesap ve hesap uyumu | MEVCUT | `account-link.ts`, `postgres-accounts.ts`, `account-fit.ts`; hesap ve taslak ilişkileri owner kapsamlı. Her kategoride aynı başarı iddiası yok. |
| Handle ekleme, kategori ve ses analizi | MEVCUT | `account-link.ts`, `account-inference.ts`; eski “OAuth dışında hesap eklenemez” tespiti güncel değil. Manuel tercihler korunur. |
| X ile giriş | MEVCUT / maliyet istisnası AÇIK | `auth.ts`: PKCE ve `/2/users/me`; giriş yayın izni değildir. Maliyetsiz olduğu ileri sürülmez. |
| Sahiplik | MEVCUT | `account-link.ts`: public handle eklemek sahiplik sağlamaz; süreli challenge gerekir. |
| Gönderi inceleyicisi | MEVCUT | `post-view.ts`, `post-detail.tsx`, `/post/[postId]`, paralel modal slotu. Public snapshot ile owner analizi ayrıdır. |
| Fırsat puanları | MEVCUT / performans KISMİ | `scoring.ts`, `calibration.ts`, `draft-evaluator.ts`; heuristik puan viral olasılık değildir. Yerel değerlendirme canlı kategori başarısı sayılmaz. |
| AI / BYOK | MEVCUT | `ai.ts`, `keys-page.tsx`; model ve sağlayıcı maliyeti kullanıcı yapılandırmasına bağlıdır. Test çağrısı da maliyet doğurabilir. |
| Taslak, düzenleme ve onay | MEVCUT | `postgres-drafts.ts`, `drafts-page.tsx`; insan iradesi korunur. Toplu görünüm seçenektir. |
| Kullanıcı tarafından paylaşım hazırlığı | MEVCUT | `publishing-preparation.ts`: Web Intent / manuel URL / native scheduling yönlendirmesi gönderim başarısı değildir. |
| Otomatik / ücretli resmî yayın | KAPALI | Merkezi maliyet sınırı ve mevcut dispatch politikası; [resmî API denetimi](evidence/official-api-boundary.md). Prime fiyatı ve yetkisi tanımlanmadı. |
| Publication receipt | MEVCUT / canlı sonuç DOĞRULANMAMIŞ | `publishing-preparation.ts`, `publication-service.ts`; public gözlem ve resmî teyit aynı kanıt seviyesi değildir. |
| Yerel MCP | MEVCUT | `scripts/ispatla-mcp.ts`, `src/server/mcp.ts`; uygulama oturumunu doğrular. |
| Uzak MCP | MEVCUT kod / üretim DOĞRULANMAMIŞ | `/mcp`, OAuth discovery/register/authorize/consent/token/revoke; önceki “yalnız stdio var” tespiti eskidi. PKCE, scope, audience ve revoke kodu canlı istemci kanıtı değildir. |
| Kaynak taraması ve worker | MEVCUT kod / operasyon DOĞRULANMAMIŞ | `monitoring.ts`, `scripts/automation-worker.ts`; çalışan süreç/sağlayıcı sonucu ayrıca gerekir. |
| Analytics | MEVCUT / erişim ve büyüme DOĞRULANMAMIŞ | `postgres-analytics.ts`; nullable veri sıfır veya garantiye çevrilmez. |
| Landing ve demo | MEVCUT | `campaign-landing.tsx`, `campaign-preview.tsx`; tarihli gerçek 𝕏 kaynağı ve ayrı düzenlenebilir taslaklar kullanılır. Müşteri başarısı iddiası yok. |
| İlk değer ve yardım | MEVCUT / canlı sağlayıcı DOĞRULANMAMIŞ | [ilk kullanım kaydı](evidence/first-value-readiness.md). |
| 20 dil ve SEO | MEVCUT teknik kapsam / ana dil incelemesi KISMİ | `config.ts`, yerelleştirilmiş copy, metadata/sitemap/robots. Doğal dil kalitesi otomatik testle kanıtlanmaz. |
| Ölçüm | MEVCUT toplulaştırılmış olaylar | `landing-measurement.ts`, `scripts/landing-report.ts`; günlük olaylar, kayıt sayısı ve ilk kalıcı taslak süreleri. Anonim ziyaretçi ile kayıt eşlenmez. |
| Hit paylaşımı | KISMİ | `postgres-hit-sharing.ts`; açık opt-in ve doğrulama kapıları var. İzin verilmiş gerçek başarı örneği bulunmadı. |
| Gerilla kampanyaları / trafik deneyleri | ÖNERİ / YAYINLANMADI | Bu belgedeki taslaklar ve deney protokolü; dış platform gönderimi veya sonuç uydurulmaz. |

## B. Conflict Register

| Çelişki | Karar ve uygulanacak sınır |
| --- | --- |
| “Social AI HitMaker”, “The Signal Press”, paralel sloganlar | Güncel kimlik **İSPATLA / ispatla.tr**. Kesin slogan **Algoritmaya tapma. İspatla.** Kullanılmayan landing sözlükleri kaldırılır; tarihsel planlar açıkça arşiv olarak işaretlenir. |
| SaaS başarı panosu / gerçek fırsat ürünü | İlk deneyim kaynak, hesap uyumu, gerekçe ve düzenlenebilir taslak gösterir. Ölçülmemiş bir başarı panosu veya işlevsiz dönem kontrolü gösterilmez. |
| Önceki “site gereksiz” kararı / güncel landing önceliği | Son kullanıcı kararı landing ve müşteri iletişimini önceler; eski karar güncel kapsamı iptal etmez. |
| “Bir hesap” / çoklu hesap kampanyası | Tek yararlı döngü her hesaba uygulanır. Tek tek veya toplu inceleme kullanıcının seçimi. |
| FxTwitter / resmî doğrulama | Public gözlem ayrı, resmî doğrulama ayrı; kaynak, zaman ve eksik veri görünür. |
| Prime öncesi resmî ücretli API / X girişi | Veri ve yayın işlemleri kapalı; kullanıcı tarafından korunması istenen giriş ayrı istisna olarak envanterde. “API tamamen ücretsiz” iddiası yok. |
| OAuth grant / yayın yetkisi | Giriş kimliği, sahiplik ve eylem izni ayrı. AI taslağı, MCP parametresi veya scope insan onayı üretmez. |
| Eski README bağlantı uçları / V5 | Handle ekleme, güncel dashboard yolları, `/api/auth/callback/twitter` ve uzak MCP yardımına göre belgeler yenilenir. |
| Uzak MCP yok / V5 uygulaması | Kod mevcut; canlı OAuth istemci ve proxy/Origin davranışı ayrıca doğrulanır. |
| Araştırma / piyasaya çıkmış tahmin modeli | Heuristik ve shadow deneyleri performans vaadi olarak kullanılmaz. |
| Eski campaign görselleri / yeni marka | Eski eserler otomatik kullanılmaz. Verilen `logo.svg`, `brain.svg`, Libron ve kağıt/karbon/kobalt korunur. |
| Genel oranlar / gerçek dönüşüm | Olay sayısı kişi sayısı değildir. `signup_click / landing_view` yalnız olay oranı olabilir; kullanıcı dönüşümü veya nedensel etki denmez. |

## C. Brand Strategy

**Kimlik:** Ürün adı İSPATLA, wordmark/domain ispatla.tr. Tek kesin Türkçe slogan: **Algoritmaya tapma. İspatla.** Noktalama korunur. İngilizce slogan hâlâ açık karardır; açıklayıcı İngilizce ürün cümlesi onaylanmış slogan gibi sunulmaz.

**Karakter:** Dışarıda kısa, cesur ve kanıtsız iddiaları sorgulayan; ürün içinde sakin, açık ve kullanıcıyı küçümsemeyen. Meydan okuma insanlara veya kimlik gruplarına yönelmez. Teknik yardım ve hata mesajlarında alay kullanılmaz.

**Mesaj sırası:** marka duruşu → ürünün yaptığı iş → kaynaklı örnek → hesap uyumu → düzenlenebilir taslak → kanıt sınırı → düşük baskılı devam adımı. AI ve MCP özellik olarak görünür; ürünün bütün tanımı yerine geçmez.

**Türkçe ürün metni:** “𝕏 kaynaklarını incele. Hesabına uygun fırsatları seç, taslağı kendi sesinle düzenle. Kaynağı ve kararın gerekçesini birlikte gör.”

**English product copy:** “Inspect 𝕏 sources, find topics that fit your accounts, and edit drafts in your own voice. See the source and the reasoning behind each opportunity.” This is descriptive copy, not a finalized translation of the brand slogan.

**Görsel sabitler:** Verilen `public/brand/logo.svg` ve `brain.svg`; Libron; Archive Paper `#F0EDE5`, Carbon Ink `#16191E`, Signal Cobalt `#315BF5`, Warm Archive `#9A9A91`, Rejected `#BC453D`, Verified `#477865`. Son iki renk metinsel durum etiketinin yerini alamaz. Gradient, glow, cam yüzey ve rastgele semboller kimlik öğesi değildir.

**İddia kuralı:** Her özellik cümlesinin kod, çalışır yol veya kanıt bağlantısı olmalı. Viral garanti, uydurma başarı, sahte kıtlık, sahte kullanıcı, keyfî model kesinliği ve “açık kaynak = sıfır maliyet” yasak. Bilinmeyen bilgi açıkça bilinmiyor olarak gösterilir.

### Hazır kampanya metinleri — yayınlanmış değildir

1. **Algoritma Mitleri:** “Algoritmanın sırrı bulunmuş. Kaynak nerede? Algoritmaya tapma. İspatla.” Devamı: tek bir iddiayı, ölçüm yöntemini ve eksiklerini inceleyen ürün örneği. Bir kişi hakkında suçlama yok.
2. **Kara Kutuyu Aç:** “Bu fırsatı neden seçtik? Kaynak burada. Gerekçe burada. Karar sende.” Devamı: gerçek scorer dokümanı ve etiketli örnek. Açık kaynak bağlantısı içerik yerine geçmez.
3. **İSPATLA Dosyaları:** “Konu / kaynak ve tarih / gözlem / hesap uyumu / yorum / bilinmeyenler / sonraki adım.” Her dosya bağımsız kontrol edilebilir; kişisel veriler yalnız açık izinle.
4. **Kaynaksız Vaatler:** “30 günde 100 bin takipçi. Hangi hesapla? Hangi bütçeyle? Hangi örneklemle?” Devamı: ölçüm bağlamı açıklaması. İSPATLA için sonuç vaadine çevrilmez.
5. **Tahmin ve Gerçek:** Henüz yayınlanmaz. Önceden belirlenmiş örneklem, izinli gerçek sonuçlar, başarısız örnekler ve hata payı hazır olduğunda kullanılır. Sentetik veri bu kapıyı açmaz.

**Kurucu / ürün hesabı:** Kurucu kişisel süreç, hatalar ve teknik görüşler paylaşır. Ürün hesabı gerçek değişiklik, demo ve kaynak paylaşır. Kurucunun görüşü ürün tarafından doğrulanmış bulgu gibi sunulmaz. Otomatik reply/DM, etkileşim grubu ve toplu takip kampanyası yok.

## D. Marketing Architecture

1. **Landing:** Beş–on saniyede 𝕏 kaynakları, hesap uyumu ve taslak kontrolü anlaşılır. İlk CTA kayıt duvarı olmadan örneğe gider. Marka sloganı ürün açıklamasıyla desteklenir.
2. **İnteraktif çalışma alanı:** Tarihli gerçek 𝕏 kaynağı, kanonik gönderi bağlantısı ve hesap bağlamı bir arada. Hesap değişince açı ve taslak değişir. Kaynak metni korunur; kullanıcının düzenlediği yanıtlar kaynak gönderiden ayrı tutulur. Ölçülmemiş etkileşim veya müşteri başarısı eklenmez.
3. **Yazım:** AI taslağı ile kullanıcı düzenlemesi ayrı. Düzenleme ve reddetme mümkündür. İnceleme tek tek veya birlikte yapılır; gösterim canlı yayın emri değildir.
4. **Kanıt:** Gözlem / hesaplama / AI yorumu / doğrulanmış işlem / bilinmiyor. Yanlış eşleme örneği: FxTwitter gözlemi → resmî doğrulama; bu eşleme yasak.
5. **Onboarding:** Public handle → sınırlı analiz → önerilen konular/ses → fırsat → taslak. Gelişmiş sağlayıcı ve izin adımları ihtiyaca göre açılır. Kişisel profil görünürlüğü ve hesap sahipliği ayrı seçimlerdir.
6. **Açık kaynak:** Kaynak kodu, AGPL-3.0-or-later, güncel kurulum, yöntem ve kanıt sınırı. Şeffaflık sayfası kapasite yerine gerçek durum anlatır.
7. **𝕏 dağıtımı:** Kullanıcı elle yayımlar. İçerik bir hipotez, örnek ve doğrudan ilgili ürün yolu taşır. UTM/person takibi zorunlu değil; mevcut coarse source sınıfları korunur.
8. **GitHub dağıtımı:** README sorunu, ilk çalıştırmayı ve kanıtları açıklar; Issues/PR gerçek düzeltme kanalıdır. Yıldız sayısı müşteri sayısı sayılmaz.
9. **SEO:** Mevcut 20 locale, karşılıklı hreflang/canonical, sitemap ve OG. Yeni sayfa yalnız özgün bir soruya yöntem/örnek sunuyorsa açılır. Otomatik yüzlerce SEO varyasyonu veya sahte yazar yok.
10. **Paylaşılabilir çıktı döngüsü:** Kullanıcı izinli kaynaklı kart → okuyucu örneği inceler → kendi hesabıyla fırsat seçer. Yeni kamusal paylaşım alanı henüz açık ürün kararıdır; mevcut özel taslaklar yayınlanmaz.

## E. Experiment Plan

Bu protokol hazırlanmıştır; insan katılımcı, üretim trafiği veya kampanya sonucu toplanmış değildir. Slogan deney değişkeni değildir.

| Deney | Hipotez / tetik | Birincil ölçüm | Koruma ve karar |
| --- | --- | --- | --- |
| E1 Beş saniyelik anlama | İlk ziyaretçi ürünün 𝕏 kaynaklarından fırsat ve taslak yardımı sunduğunu anlatabilir | Ekran kapatıldıktan sonra yardımsız ürün tanımı; demo verisini gerçek sanan kişi sayısı | Kullanıcıyla görüşme gerekir. Önce küçük nitel pilot; örnek sayısı ve seçim yöntemi raporda yazılır. “Anlaşıldı” yargısı cevap kodlarıyla desteklenir. |
| E2 Örnek önce / özellik önce | Kaynaklı örnek, soyut özellik listesine göre daha anlaşılır | Aynı görevi tamamlayabilme, gerekçeyi bulabilme, yanlış garanti çıkarımı | Katılımcı sırası dengelenir. Düşük trafikte birkaç tıklama istatistiksel başarı sayılmaz. |
| E3 Hesap uyumu | Aynı konunun farklı hesaplara göre değişmesi farkı görünür kılar | Katılımcının seçtiği hesap için gerekçeyi doğru açıklaması | Kategori çıkarımı hassas kişilik özelliğine dönmez; karşılaştırma kaynakları aynı tutulur. |
| E4 CTA | Örneğe geçiş CTA'sı inceleme başlatır | `demo_start`, `demo_complete`, `signup_click` ayrı günlük toplamlar | Bunlar olaydır, kişi dönüşümü değildir. Mevcut ölçümle nedensel A/B kararı verilmez. |
| E5 Açık kaynak güveni | Yöntem bağlantısı incelenebilirliği artırır | Yardımsız yöntemi bulma; `github_click`, `open_source_docs` ayrı olay toplamları | “Kod açık olduğundan güvenli” sorusuna katılımcı yanıtı ayrıca incelenir. |
| E6 Provokasyon / açıklama | Kısa iddia-soru içeriği ürüne uygun merak oluşturur | İzinli kullanıcı görüşmesi; coarse 𝕏 referral olayları; yanlış ürün beklentisi | Ürün adı, CTA hedefi ve gerçek örnek sabit. İzlenme veya paylaşım tek başına nitelikli müşteri ölçüsü değil. |
| E7 İlk kalıcı taslak | İlk yararlı göreve erişimde sürtünme azalır | `scripts/landing-report.ts` kayıt günü ve ilk kalıcı taslak zaman kovaları | Anonim ziyaretle eşlenmez; silinen taslaklar geçmişi değiştirir. “İlk kalıcı taslak” operasyonel vekildir, kesin aktivasyon tanımı değildir. |

**Nicel deney kapısı:** Önceden hedef kitle, randomizasyon birimi, baseline, anlamlı minimum etki, örnek büyüklüğü/güç hesabı, durdurma kuralı ve hata ölçüleri yazılmadan A/B sonucu ilan edilmez. Mevcut kimliksiz event altyapısı kişi bazında randomizasyon/attribution kanıtı sağlamaz. Böyle bir sistem ayrı gizlilik ve ürün kararı gerektirir.

**Rapor şablonu:** Kim/ne zaman/hangi sürüm → hipotez → örneklem ve seçim → görev → ham toplulaştırılmış sonuç → belirsizlik → başarısız örnekler → karar → tekrar kontrol tarihi. Sonuç yoksa sonuç hücresi “çalıştırılmadı” olur.

### Araştırma dayanağı ve sınırları

25 Ekim 2026'da birincil yayıncı/araştırmacı sayfaları kontrol edildi. Aşağıdaki uyarlamalar İSPATLA için çıkarım/hipotezdir; ürün büyümesine kanıt değildir.

- [Hutter & Hoffmann, 2011](https://scialert.net/fulltext/amp.php?doi=ajm.2011.39.54): sürpriz ve yayılımı kavramsal olarak ele alır; ampirik etkililik kanıtının sınırlılığını belirtir. İSPATLA çıkarımı: provokasyon ürün ve marka bağlantısını kaybetmemeli.
- [Berger & Milkman, 2012](https://journals.sagepub.com/doi/10.1509/jmr.10.0353): içerik paylaşımı ve uyarılma üzerine araştırma. 𝕏 algoritması veya bugünkü SaaS dönüşümü için reçete değildir. İSPATLA çıkarımı: faydalı/sürprizli açıklamayı dene; öfkeyi hedef metrik yapma.
- [Menon & Soman, 2002](https://www.tandfonline.com/doi/abs/10.1080/00913367.2002.10673672): merak, öğrenme ve bilgi aramayı simüle reklam ortamında inceler. İSPATLA çıkarımı: soru sor, ipucu ver, yanıtı kayıt duvarının arkasına koyma.
- [Berger & Heath, 2007](https://doi.org/10.1086/519142): kimlik ve farklılaşma başlığı. Yayıncı içeriğine bu kontrolde erişilemedi; sayısal sonuç veya İSPATLA için etki iddiasına dayanak yapılmadı. Paylaşılabilir araştırma kartı hâlâ hipotezdir.
- [Eisend, 2009](https://link.springer.com/article/10.1007/s11747-008-0096-y): mizahın dikkat/duygu ve kaynak güvenilirliğinde farklı etkilerini ele alan meta-analiz. İSPATLA çıkarımı: kullanıcıyla alay etme; mizahı yöntem açıklamasıyla eşleştir.
- [Li & Shi, 2025/2026](https://academic.oup.com/hcr/article/52/1/38/8178818): özgürlüğü tehdit eden dilin tepkiyle ilişkisini meta-analiz eder. İSPATLA çıkarımı: marka cesur olsa da ürün adımı kullanıcı seçimine dayanmalı.
- [Kohavi, Tang & Xu, 2020](https://doi.org/10.1017/9781108653985): güvenilir çevrimiçi deney metodolojisi. İSPATLA çıkarımı: küçük event toplamından nedensellik veya kesin kazanım çıkarma.
- [Google Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): kullanıcı faydası, özgünlük ve nasıl üretildiğinin açıklığı. İSPATLA çıkarımı: yerelleştirme yalnız arama hacmi için içerik çoğaltma olmamalı.
- Briefteki Ehrenberg-Bass/LinkedIn PDF'si bu turda tam metin doğrulanmadı; distinctive assets ilkesi burada kullanıcı tarafından verilmiş marka standardı olarak uygulanır, bağımsız akademik büyüme kanıtı sayılmaz.

## F. Technical Readiness

| Pazarlama cümlesi | Teknik önkoşul | Kullanılabilir ifade / doğrulanmamış kısım |
| --- | --- | --- |
| “Kaynağı incele” | Public snapshot, URL, kaynak zamanı, nullable alanlar | Kodda mevcut; sağlayıcı erişimi anlık başarısız olabilir. |
| “Hesabına uygun konu” | Owner hesabı, kategori, açıklanan gerekçe | Karar desteği; gelecekteki erişim olasılığı değil. |
| “Kendi sesinde taslak” | Voice ayarı, AI/BYOK ve editör | Yardımcı taslak; gerçek içerik kalitesi ve kullanıcı kabulü ayrıca ölçülür. |
| “Çoklu hesap” | Owner-scoped ilişkiler, hesap seçimi | Görünüm/üretim var; toplu yayın garantisi yok. |
| “MCP ile bağlan” | Stdio session veya uzak OAuth/scope/PKCE/revoke | Kaynak ve test var; canlı istemci handshake ayrıca operasyon kanıtı ister. |
| “Sonucu incele” | Author/text/target bağlı receipt ve veri kökeni | Public gözlem ve resmî teyit ayrılır; belirsiz sonuç success değildir. |
| “Prime” | Onaylı entitlement, bütçe, kota, ürün fiyatı | Hazır paket veya fiyat ilan edilmez; resmî ücretli işlem kapalıdır. |
| “Öğrenir” | Etiketli sonuç, holdout kalibrasyon, leakage kontrolü | Yerel yöntem var; üretimde öğrenilmiş üstünlük iddiası yok. |
| “20 dil” | Eksiksiz çeviri, SEO ve RTL | Teknik test kapsamı var; insan dil kalitesi incelemesi tamamlandı denmez. |
| “Üretimde çalışır” | Migration, gerçek mail/OAuth/provider, worker lease, deployment ve tarayıcı | Bu teslim yerel kod/check kanıtıdır; canlı operasyon ayrı kayıt ister. |

## G. Prioritized Roadmap

### P0 — bu teslimin zorunlu sınırları

- **Marka birliği:** Eski slogan ve kimliklerin kaynakta taşınması ilk ziyareti dağıtıyordu. Tek kimlik/slogan ve verilen varlıklar kullanılır. Fayda: tanınabilirlik. Bağımlılık: yerelleştirilmiş copy. Risk: onaylanmamış slogan çevirisi. Doğrulama: kaynak taraması, 20-locale render ve tarayıcı. Tamamlanma: aktif landing/shell'de emekli marka mesajı yok.
- **Maliyet sınırı:** Scope sahibi hesap tek başına ücretli işlemi açmamalı. Paylaşılan resmî istemci ve çağrı yolları kapatılır; X giriş istisnası ayrı kaydedilir. Fayda: beklenmeyen provider maliyetini önleme. Bağımlılık: endpoint envanteri. Risk: dolaylı MCP/worker yolu. Doğrulama: ağ çağrısı yapılmadığını gösteren testler. Tamamlanma: giriş dışında paid API fail-closed.
- **Dürüst ürün örneği:** Eski başarı panosu ürün döngüsünü yeterince göstermiyordu. Kaynak/gerekçe/hesap/düzenleme/evidence örneği eklenir. Fayda: ilk değeri kayıt olmadan anlama. Bağımlılık: demo copy ve istemci state. Risk: örneğin gerçek müşteri sanılması. Doğrulama: kaynak/tarih bağlantısı, kontrol davranışı, klavye/RTL/mobile. Tamamlanma: tüm desteklenen dillerde aynı anlamlı akış.
- **Güncel teknik belgeler:** README ve mimari eski `/app`/bağlantı varsayımlarını anlatıyordu. Kodla eşitlenir. Fayda: yanlış kurulum ve yanlış vaat azalır. Bağımlılık: güncel auth/MCP/worker kaynağı. Risk: eski planı gerçek sanma. Doğrulama: caller/route/source karşılaştırması. Tamamlanma: aktif doküman güncel, eski kayıt tarihsel etiketli.

### P1 — kullanılabilirlik ve ölçüm

- **İlk değer:** Handle ve sınırlı analizden fırsata/taslağa açık yollar; gelişmiş ayarlar isteğe bağlı. Fayda: daha az zorunlu adım. Bağımlılık: owner analizi ve gerçek provider. Risk: yetersiz veri. Doğrulama: partial/empty/success durumları ve odaklı testler. Tamamlanma: boş sonuç doğrulanmamış başarı gibi görünmez.
- **Anlama ve CTA deneyleri:** E1–E3 protokolleriyle görüşme. Mevcut durum: protokol hazır, katılımcı yok. Fayda: gerçek kullanıcı anlatımı. Bağımlılık: gönüllü katılımcılar. Risk: kurucu örneklem yanlılığı. Doğrulama: görev ve cevap kodları. Tamamlanma: yöntem ve sonuçları açık rapor; uygulama öncesi kazanç iddiası yok.
- **Dil kalitesi:** Mevcut 20 dil teknik kapsamına ana dil kontrolü eklenir. Fayda: doğal ürün anlatımı. Bağımlılık: dil editörleri. Risk: slogan anlam kaybı. Doğrulama: örnek görev ve terim kontrolü. Tamamlanma: her dil için tarihli inceleme kaydı.

### P2 — izinli dağıtım

- **Algoritma Mitleri / Kara Kutuyu Aç / Dosyalar:** Taslaklar hazır, paylaşılmadı. Fayda: meraktan gerçek yöntem incelemesine geçiş. Bağımlılık: içerik ve gerçek hedef URL. Risk: kişiye yönelik itham/spam. Doğrulama: kaynak ve kampanya kalite listesi. Tamamlanma: kullanıcı tarafından seçilen içerik için yayımlanmış URL ve ayrı sonuç raporu.
- **Özgün SEO rehberleri:** Soru, yöntem, tarihli örnek ve sınırlama. Mevcut durum: konu önerileri; yeni kitle sayfası fabrikası yok. Fayda: araştırma niyeti. Bağımlılık: özgün içerik. Risk: yüzeysel çokdillilik. Doğrulama: Google ilkeleri + okuyucu görevi. Tamamlanma: faydalı makale ve güncelleme sahibi.
- **Paylaşılabilir kartlar:** Mevcut hit opt-in altyapısı üzerinde yeni fırsat kartı ayrı ürün kararı. Fayda: izinli ürün keşfi. Bağımlılık: veri kapsamı ve consent. Risk: özel taslak sızıntısı. Doğrulama: erişim/iptal testleri. Tamamlanma: hangi verinin kamusal olduğu kullanıcıya açık ve geri alınabilir.

### P3 — gerçek sonuç, Prime ve uzun vadeli öğrenme

- **Tahmin / gerçek:** Önceden tanımlı örneklem ve izinli sonuçlar beklenir. Fayda: hata ve kalibrasyon öğrenimi. Bağımlılık: güvenilir outcome verisi. Risk: cherry-picking ve leakage. Doğrulama: holdout/örneklem/eksik veri analizi. Tamamlanma: başarı ve başarısızlığı birlikte raporlayan tarihli çalışma.
- **Prime:** Paket, fiyat, kota ve maliyet modeli açık. Fayda: sürdürülebilir ücretli erişim. Bağımlılık: onaylı ürün kararı, sağlayıcı koşulları, server entitlement ve harcama rezervasyonu. Risk: maliyet taşması. Doğrulama: bounded bütçe/idempotency/bypass testleri. Tamamlanma: kullanıcı kararı + gerçek maliyet/operasyon kanıtı; bu teslimde etkinleştirilmez.
- **Üretim kabulü:** Güncel migration, OAuth/mail/AI/MCP ve worker kontrolleri işletmeciyle doğrulanır. Fayda: gerçekten kullanılabilir servis. Bağımlılık: yetkili canlı ortam ve hesaplar. Risk: yerel fixture'ı canlı kanıt sanmak. Doğrulama: tarihli dağıtım ve işlem kaydı. Tamamlanma: her canlı gate ayrı kanıtlı.

## H. Open Decisions

| Başlık | Şimdiki sınır / karar sahibi |
| --- | --- |
| İngilizce slogan | Türkçe kesin slogan yeniden oylanmaz. İngilizce kültürel uyarlamayı ürün sahibi seçer; şimdilik açıklayıcı ürün metni kullanılır. |
| Prime işlemleri | Paket kapsamı ürün sahibi; resmî ücretli veri/yayın kapalı kalır. |
| X giriş maliyeti | Son tercih girişi korur. `/2/users/me` maliyet istisnasının ticari kararı ürün sahibi/işletmeciye aittir; ücretsiz varsayılmaz. |
| Prime fiyat/kota | Fiyat uydurulmaz; gerçek maliyet verisi olmadan paket ilan edilmez. |
| Landing sadeleştirme | Çözüldü: Math Campaign/Excuse Burner aktif landing'den çıkarıldı; otomatik geri dönmez. |
| Aktivasyon | İlk kalıcı taslak mevcut rapor vekili; kesin ürün aktivasyonu için görüşme ve görev verisi gerekir. |
| Paylaşılabilir fırsat verisi | Public kaynak bile olsa kullanıcı taslağı/hesap analizi otomatik kamusal yapılmaz. Veri kapsamını ürün sahibi seçer. |
| Yerelleştirme | Slogan birebir çeviri olarak dayatılmaz; her dil için ürün anlamı ve terimler korunur. Ana dil onayı ayrı iş. |
| Başarı ölçümü | Public gözlem ve resmî doğrulama ayrı raporlanır. Ücretli resmî ölçüm açılması Prime kararına bağlıdır. |
| Kampanya sırası | Taslaklar hazır; hangi kampanyanın ne zaman yayımlanacağı seçilmedi. Otomatik yayın yok. |

## Teslimin okunması

Uygulama değişikliği, araştırma/protokol teslimi ve dış dünyada çalıştırılmış deney ayrı sonuçlardır. Bu belgenin tamamlanması 90 günün geçmiş olduğu, katılımcı toplandığı, Prime'ın satıldığı veya üretimde sonuç alındığı anlamına gelmez. Kod ve yerel kanıtlar için [brief kabul kaydı](BRIEF_ACCEPTANCE.md), [resmî API sınırı](evidence/official-api-boundary.md) ve [ilk kullanım kaydı](evidence/first-value-readiness.md) kullanılır.
