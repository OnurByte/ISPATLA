# İSPATLA

## Algoritmaya tapma. İspatla.

𝕏 kaynaklarını incele. Hesaplarına uygun konuları seç, AI taslağını kendi sesinle düzenle.

[ispatla.tr](https://ispatla.tr) ⁜ [Kurulum ve yardım](https://ispatla.tr/docs) ⁜ [Ürün ve marka stratejisi](docs/PRODUCT_STRATEGY.md)

İSPATLA; kaynak gönderiyi, hesap uyumunu, karar gerekçesini ve düzenlenebilir taslağı aynı çalışma alanında tutar. Birden fazla hesap için çalışabilir; içerikleri tek tek ya da birlikte inceleyebilirsin. Kaynak ağı 𝕏'tir. Bu GitHub deposu ürünün kodu, yöntemi ve katkı kanalıdır.

- Public handle üzerinden hesap ekleme, konu ve yazım tarzı analizi.
- Hesaba bağlı kaynaklar, fırsatlar ve kaynak gönderi inceleyicisi.
- Kendi AI sağlayıcın/anahtarınla taslak üretme ve düzenleme.
- Kullanıcı tarafından paylaşım hazırlığı ve veri kökeni korunan sonuç gözlemi.
- Yerel stdio ve OAuth ile yetkilendirilen uzak MCP bağlantısı.

Puanlar viral olasılık değildir. Public FxTwitter gözlemi resmî 𝕏 API doğrulaması sayılmaz. AI ve altyapı ücretleri kullanılan sağlayıcıya bağlıdır. AGPL-3.0-or-later lisansı hizmetlerin ücretsiz olduğu anlamına gelmez.

## Yerel başlangıç

Node.js 22.5+ ve Bun kullanılır. Repo kökünde çalıştırın:

```sh
bun install --frozen-lockfile
```

Yerel, Git'e eklenmeyen ortam dosyanızda veya süreç ortamında yapılandırın:

```text
BETTER_AUTH_SECRET=<en az 32 karakterlik rastgele gizli değer>
BETTER_AUTH_URL=http://localhost:3000
ISPATLA_TOKEN_KEY_CURRENT=<rastgele token şifreleme anahtarı>
ISPATLA_SECRET_KEY=<AI kasası için ayrı rastgele anahtar>
ISPATLA_AUTOMATION=0
DATABASE_URL=postgresql://<role>:<password>@<host>:<port>/<database>
```

Boş geliştirme veritabanına `supabase/migrations/` dosyalarını ad sırasıyla uygulayın. Mevcut üretim veritabanı üzerinde deneme yapmayın. Supabase kullanılıyorsa Connect panelindeki tam transaction-pooler URI'sini alın; host/parola tahmin etmeyin. Uygulama Supabase bağlantılarında TLS sertifikasını doğrular. Landing veritabanı olmadan okunabilir; oturum ve özel çalışma alanı veritabanına ihtiyaç duyar.

```sh
bun run dev
```

Landing `/`, kayıt `/signup`, giriş `/login`, çalışma alanı `/dashboard`, fırsatlar `/opportunities`, hesaplar `/accounts`, taslaklar `/drafts` adreslerindedir. Yerelleştirilmiş rotalar 20 dili destekler; varsayılan İngilizce rotası öneksizdir; Türkçe `/tr` altındadır.

Mail gönderimi için `ISPATLA_MAIL_API_URL` ve `ISPATLA_MAIL_API_TOKEN` kullanılır. HTTPS JSON taşıyıcısı `to`, `subject`, `text` alanlarını kabul etmelidir. Gerçek teslim ayrıca doğrulanır. `ISPATLA_PRIVATE_BETA=1`, e-posta doğrulamasını kapatan geliştirme/beta tercihidir.

## Hesap, giriş ve yayın

Public kullanıcı adını eklemek OAuth veya 𝕏 parolası gerektirmez. Profil ve public gönderiler FxTwitter üzerinden analiz edilir; eksik veri partial sonuç üretebilir. Handle eklemek sahiplik kanıtı değildir. Sahiplik ayrı doğrulanır. Manuel konu ve ses tercihleri yeniden analizde korunur.

𝕏 ile uygulamaya giriş, `X_OAUTH_CLIENT_ID` ve `X_OAUTH_CLIENT_SECRET` yapılandırıldığında kullanılabilir. Developer Console callback adresi:

```text
http://localhost:3000/api/auth/callback/twitter
```

Üretimde kendi HTTPS origin'inizi kullanın. Giriş salt okuma scope'ları ve PKCE kullanır; giriş grant'i otomatik yayın izni vermez. Girişteki `/2/users/me` çağrısının maliyeti için sıfır ücret iddiası yapılmaz.

**Prime öncesinde resmî ücretli veri/yayın istemcisi kapalıdır.** Bir ortam değişkeni, OAuth scope'u veya MCP parametresi bu sınırı açmaz. Prime entitlement ve bütçe doğrulaması henüz uygulanmadığından bu işlemler kullanılabilir gösterilmez. Public FxTwitter okuma ve kullanıcı tarafından tamamlanan paylaşım hazırlığı ayrı akışlardır. [Resmî API sınırı](docs/evidence/official-api-boundary.md).

Web Intent veya zamanlama ekranının açılması yayın başarı kanıtı değildir. Public receipt author/metin/hedef bağlamıyla ilişkilendirilir; belirsiz işlem kör yeniden denenmez. Otomatik like, DM ve spam kampanyaları ürün yolu değildir.

## MCP

Yerel stdio sunucusu:

```sh
bun run mcp
```

İstemci süreç ortamındaki `ISPATLA_MCP_SESSION_COOKIE`, gerçek uygulama oturumunu temsil eder. Parola gibi koruyun; Git, log veya paylaşılan ayarlara koymayın.

Uzak istemciye dağıtımınızın `https://<origin>/mcp` adresini ekleyin. OAuth discovery, PKCE, açık consent ve iptal edilebilir scopes kullanılır: `read`, `drafts:write`, `analysis:write`, `publishing:prepare`, `receipts:write`. Taslak veya yayın hazırlama yetkisi otomatik gönderim yetkisi değildir. Erişim `/settings/security` üzerinden iptal edilebilir. [Bağlantı rehberi](https://ispatla.tr/docs#mcp).

## Kontroller ve worker

```sh
bun test --isolate
bun run lint
bun run typecheck
bun run test:seo
bun run build
```

Kaynak taraması `bun run automation:scan`, kalıcı worker `bun run automation:worker` ile çalışır. Kaynaklar, owner sınırları ve veritabanı hazır olmalıdır; bir sürecin başlaması veri kalitesini veya gerçek yayını kanıtlamaz. [Worker rehberi](docs/RUN-WORKER.md).

Günlük pazarlama raporu `bun scripts/landing-report.ts` ile alınır. Olay sayıları kişi sayısı değildir; anonim landing ziyareti kayıt/taslak sahibiyle eşlenmez. İlk kalıcı taslak süreleri mevcut kayıtların anlık görüntüsüdür.

[Mimari](docs/ARCHITECTURE.md) ⁜ [Brief kabul kaydı](docs/BRIEF_ACCEPTANCE.md) ⁜ [Katkı](CONTRIBUTING.md) ⁜ [Lisans](LICENSE)

Yerel fixture, test, Lighthouse veya build sonucu canlı OAuth, mail teslimi, sağlayıcı faturası ve üretim davranışının yerine geçmez. Bu kanıtlar kabul kaydında ayrı tutulur.

## Lighthouse ve SEO

`bun run test:seo`; 20 dilde canonical/hreflang, robots/sitemap, sosyal resim ve oEmbed sınırlarını doğrular. Typecheck komutu `--strict` ile çalışır.

Lighthouse için önce üretim derlemesini yerelde başlatın; geliştirme sunucusunu ölçmeyin:

```sh
bun run build
bun run start
# Ayrı terminalde:
LIGHTHOUSE_URL=http://localhost:3000/ bun run quality:lighthouse
```

Chrome/Chromium gerekir; `CHROME_PATH` ile seçilebilir. Mobile ve desktop HTML/JSON raporları `lighthouse-reports/` altına yazılır. Eşikler: performans en az 90; erişilebilirlik, Best Practices ve SEO 100. İhlal komutu başarısız yapar. Bunlar yerel laboratuvar ölçümleridir; saha Core Web Vitals veya üretim erişilebilirliği kanıtı değildir. Ölçülen origin sunucunun yapılandırılmış origin'iyle eşleşmelidir.


## Rendered SEO and favicon gate

After a production build is running locally, audit its actual responses:

```sh
bun run quality:seo http://localhost:3000
```

The gate covers sitemap pages in all 20 locales, reciprocal canonical/hreflang links, crawl rules, the reviewed brand favicon, social images, auth noindex and unknown-route 404s. It fails on missing, duplicate, conflicting or non-crawlable metadata. CI starts its own loopback production server for the same check. The origin argument can also be an explicitly selected deployment for a read-only audit; passing this gate does not prove Google has recrawled the site or changed its Search Console icon. Evidence and upstream references: [27 October usability/SEO verification](docs/qa/usability-seo-2026-10-27.md).
