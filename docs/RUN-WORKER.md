# Worker'ı sürekli çalıştırma

Worker schedule ve durum kayıtlarını PostgreSQL'e Drizzle ORM ile yazar. Aynı anda
tek worker çalışmasını PostgreSQL transaction advisory lock ile sağlar; süreç
kapanırsa kilit bağlantıyla birlikte bırakılır.

## Ortam dosyası

Gizli değerleri yalnız `~/.config/ispatla/worker.env` içinde tutun (izin `600`).
Elle başlatıldığında `scripts/worker-env.ts` dosyayı okur; süreçte tanımlı değerleri
ezmez. Alternatif yol `ISPATLA_WORKER_ENV` ile verilebilir.

```sh
DATABASE_URL=postgresql://<role>:<password>@<host>:6543/postgres?sslmode=require
ISPATLA_WORKER_TICK_MS=15000
```

Supabase için **Connect** bölümündeki transaction pooler URL'sini kullanın. Worker'ı
kurup başlatın:

```sh
install -d -m 700 ~/.config/ispatla
install -m 600 /dev/null ~/.config/ispatla/worker.env
$EDITOR ~/.config/ispatla/worker.env
bash scripts/install-systemd-user.sh
systemctl --user status ispatla-worker.service
journalctl --user -u ispatla-worker.service -n 50 --no-pager
```

Ön planda tek tick çalıştırmak için:

```sh
ISPATLA_WORKER_MAX_TICKS=1 bun run automation:worker
```

## Şu an çalışan işler

Scheduler kayıtları PostgreSQL'e taşındı. Hesap kategori çıkarımı ve PostgreSQL
kuyruk durum kontrolü çalışabilir. X kaynak taraması, kaynak canlılık kontrolü,
monitoring, eski yayın kanıtlarının uzlaştırılması ve otomatik yayın, bu depolar
Drizzle'a taşınana kadar kapalıdır. Worker log'u çalıştırılan görevleri, süreyi ve
başarısız/eksik görev sayılarını verir; post havuz sayısı raporlanmaz.

Başlangıçta `env=<yol> loaded=<sayı> kept=<sayı>` satırı yazılır; ortam değişkeni
değerleri log'a yazılmaz.
