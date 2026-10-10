# İSPATLA

İSPATLA, X üzerindeki kaynak sinyallerini fırsatlara dönüştüren, hesap için özgün
taslak hazırlayan ve yayın sonucunu kanıtla doğrulayan bir kontrol odasıdır.
Erişim, virallik veya gelir garantisi vermez.

Uygulama oturumu Better Auth ile yönetilir. X hesabı ayrı, oturuma bağlı OAuth
2.0 PKCE akışıyla bağlanır. OAuth izni otomatik yayın izni sayılmaz: her hesap ve
eylem için Observe, Assist veya Off tercihleri ayrı tutulur. Auto arayüzde henüz
etkin değildir; kazanılmış özerklik kabul koşulları uygulama durum belgesindedir.

## Katkı

Lisans: AGPL-3.0-or-later ([LICENSE](LICENSE)). Sentetik demo komutu kaldırıldı;
demo verisi PostgreSQL üzerinde güvenli ve yalıtılmış biçimde sağlanana kadar demo yolu
kullanılamaz. Ayrıntılar [CONTRIBUTING.md](CONTRIBUTING.md).

## Yerel başlangıç

Node.js 22.5+ ve Bun gerekir. Kaynak listesini kendi yapılandırmanıza
göre düzenleyin; bu komut mevcut dosyayı değiştirmez:

```sh
bun install --frozen-lockfile
```

Ortam değişkenlerini süreçte veya yerel, Git'e eklenmeyen ortam dosyasında ayarlayın:

```text
BETTER_AUTH_SECRET=<en az 32 karakterlik rastgele gizli değer>
BETTER_AUTH_URL=http://localhost:3000
ISPATLA_TOKEN_KEY_CURRENT=<rastgele token şifreleme anahtarı>
ISPATLA_SECRET_KEY=<AI kasası için ayrı rastgele anahtar>
ISPATLA_PRIVATE_BETA=1
ISPATLA_AUTOMATION=0
DATABASE_URL=postgresql://<role>:<password>@<host>:6543/postgres
```

Private beta seçeneği e-posta doğrulamasını açıkça kapatır. Normal kayıt ve parola
sıfırlama için sunucu tarafındaki e-posta taşıyıcısını yapılandırın:
`ISPATLA_MAIL_API_URL` ve `ISPATLA_MAIL_API_TOKEN`. Taşıyıcı HTTPS JSON POST kabul
etmelidir; içerik `to`, `subject`, `text` alanlarını içerir. Gerçek e-posta
sağlayıcısının teslimi ayrıca doğrulanmalıdır.

```sh
bun run dev
```

Kamusal sayfa `/`, özel kontrol odası `/app`, kayıt ve giriş `/signup` ve `/login`.
Uygulama PostgreSQL'e Drizzle ORM ile bağlanır; çalıştırmadan önce Supabase
projesinin **Connect → Transaction pooler** bölümündeki tam URI'yi `DATABASE_URL`
olarak kullanın. Biçimi `postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@<POOLER_HOST>:6543/postgres` şeklindedir; kullanıcı, parola, host ve portu bu paneldeki URI'den kopyalayın, pooler hostunu tahmin etmeyin. Vercel için de aynı transaction pooler URI'sini kullanın.
Supabase PostgreSQL bağlantısı uygulamada Supabase'in veritabanı kök sertifikasıyla doğrulanır.

## Resmi X bağlantısı

X Developer Console'da callback adresini tam eşleşmeyle kaydedin:

```text
X_OAUTH_CLIENT_ID=<uygulama client ID>
X_OAUTH_CLIENT_SECRET=<sunucu client secret>
X_OAUTH_REDIRECT_URI=http://localhost:3000/api/x/oauth/callback
```

Üretimde uygulama origin'i ve callback HTTPS olmalıdır. `/app/accounts` içindeki
“X hesabı bağla” akışı gerçek kullanıcı kimliğini `/2/users/me` üzerinden çözer;
istemcinin girdiği bir hesap kimliği yayın yetkisi vermez. Baseline kapsamları
`tweet.read tweet.write users.read media.write offline.access`.

Tokenlar ayrı tabloda AES-256-GCM ile saklanır; UI yalnız bağlantı metadatasını
görür. `ISPATLA_TOKEN_KEY_PREVIOUS_<key_id>` eski anahtarlarla okuma için kullanılabilir.
Bağlantı kaldırıldığında yerel token ve yenileme kiraları önce iptal edilir;
uzak sağlayıcı iptalinin sonucu ayrıca gösterilir.

Resmi API yayın kabulü, yayın doğrulaması sayılmaz. İş ve hesap kiraları aynı
bilinçli gönderimin tekrarlanmasını önler; bağlantı kopması ve belirsiz sunucu
hataları incelemeye alınır. Doğrulama oturumdaki X kimliği, metin, hedef ilişki ve
zaman penceresi üzerinden resmi okuma uçlarıyla yapılır. Yeniden yayınlar için
bağlı kullanıcının hedefi yeniden yayınladığına dair pozitif kanıt gerekir.

Yanıtlar, hedef yazarın hesabı mention veya quote ile çağırdığına dair kayıtlı
uygunluk kanıtı gerektirir. Quote yetkisi bilinmiyorsa kapalıdır. Otomatik like ve
DM desteklenmez. Güncel API koşulları [resmi yayın belgesinde](https://docs.x.com/x-api/posts/manage-tweets/introduction),
OAuth akışı [resmi PKCE belgesinde](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
açıklanır.

## Kontroller ve worker

```sh
bun test --isolate
bun run lint
bun run typecheck
bun run build
bun run automation:worker
```

Worker ve web zamanlayıcısı tek kalıcı çalışma kilidini paylaşır. İşler ayrıca
süreli kira, heartbeat, deneme sayısı, backoff, hata kuyruğu ve olay çizelgesi tutar.
Kaynak radar verisi ortaktır; hesap taslakları, kullanım, sırlar, işler ve yayın
niyetleri oturum sahibinin kapsamındadır. Eski yerel veritabanı taşınmaz; hesap, ayar,
taslak ve diğer uygulama verileri PostgreSQL'de yeni başlar.

Stdio MCP araçları her çağrıda `ISPATLA_MCP_SESSION_COOKIE` ile gerçek uygulama
oturumunu tekrar doğrular. Bu değer bir gizli oturum bilgisidir; paylaşmayın ve
Git'e eklemeyin. Başlatma: `bun run mcp`.

Tam sözleşme [V3 planında](docs/ISPATLA_MASTER_PLAN_V3.md), tamamlanma ve kanıt
sınırları [uygulama durumunda](docs/V3_IMPLEMENTATION_STATUS.md) tutulur.
Yerel fixture testleri gerçek X grant'i, e-posta teslimi, üretim yayını veya
üretim dağıtımı kanıtı değildir.
