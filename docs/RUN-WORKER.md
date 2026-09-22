# Worker'ı sürekli çalıştırma

Tek kural: **bir veritabanı dosyasına aynı anda tek otomasyon yazıcısı.** Worker ve
Next içi scheduler aynı `automation_lock` app_setting satırını ister; worker satırı
tutuyorsa `startScheduler()` kendini kapatır, scheduler tutuyorsa worker 3 koduyla
çıkar. Kilit 120 saniyelik kalp atışıdır: öldürülen süreç bir sonraki başlatmayı
engellemez.

## 1. Ortam dosyası

Secret'lar yalnız `~/.config/ispatla/worker.env` içinde durur (mod 600). systemd bunu
`EnvironmentFile=` ile okur; elle başlatıldığında da `scripts/worker-env.ts` aynı
dosyayı okur ve **zaten tanımlı değişkenleri ezmez**. Dosya yoksa hata değildir.
Alternatif yol: `ISPATLA_WORKER_ENV=/başka/yol.env`.

Şablon (yalnız isimler; değerleri buraya sen yazarsın, log'a hiç düşmez):

```sh
ISPATLA_SECRET_KEY=
ISPATLA_DB=/mutlak/yol/state/ispatla.sqlite3
ISPATLA_WORKER_TICK_MS=15000
OPENAI_API_KEY=
AI_COMPATIBLE_API_KEY=
JEV_API_KEY=
```

```sh
install -d -m 700 ~/.config/ispatla
install -m 600 /dev/null ~/.config/ispatla/worker.env
$EDITOR ~/.config/ispatla/worker.env
```

## 2. Web sürecini otomasyondan çıkar

Panel aynı veritabanını kullanıyorsa kendi scheduler'ını kapat:

```sh
ISPATLA_AUTOMATION=0 bun run dev      # veya: ISPATLA_AUTOMATION=0 bun run start
```

`ISPATLA_AUTOMATION=0` verilmezse web süreci kilidi almaya çalışır; kilit worker'daysa
`[ispatla] in-process scheduler devre dışı: automation_lock sahibi worker pid=...`
satırını yazıp otomasyonu başlatmaz.

## 3. Worker'ı kur ve başlat

```sh
bash scripts/install-systemd-user.sh          # unit'i yazar, env dosyasını (yoksa) oluşturur, enable --now yapar
systemctl --user status ispatla-worker.service
journalctl --user -u ispatla-worker.service -n 50 --no-pager
```

Servissiz, ön planda denemek için:

```sh
ISPATLA_DB=$PWD/state/ispatla.sqlite3 ISPATLA_WORKER_MAX_TICKS=1 bun run automation:worker
```

Durdur / yeniden başlat:

```sh
systemctl --user restart ispatla-worker.service
systemctl --user disable --now ispatla-worker.service
```

## 4. Tick log'u

Her tick tek satır (stderr → journal):

```
[ispatla-worker] tick=12 ran=2 failed=0 partial=0 pool=18 threshold=55 publishing=on ms=812 \
  monitor_engine=success(attempted:14,skipped:0,failed:0;640ms) source_scan=success(sources:9,postsSeen:180,postsNew:23,postsScored:0;170ms)
```

- `pool` = `opportunityCount()`, `threshold` = `opportunityPoolThreshold()`.
- `publishing` = `paused` ise yayın durdurulmuştur, havuz dolmaya devam eder.
- Başlangıçta ayrıca `env=<yol> loaded=<sayı> kept=<sayı>` satırı yazılır; **değer değil, yalnız sayı**.

## 5. Yayını durdurup havuzu doldurmaya devam etmek

```sh
# yalnız yayın dursun (monitor + scan + Jev sıralama sürer)
bun -e 'const {setSetting}=await import("./src/server/db.ts");setSetting("publishing_paused","1",Math.floor(Date.now()/1000));'
# geri aç
bun -e 'const {setSetting}=await import("./src/server/db.ts");setSetting("publishing_paused","0",Math.floor(Date.now()/1000));'
```

`automation_paused=1` de yayını durdurur (eski davranış) ama kuyruk işçisini de
kapatır. Havuzu doldururken yayını kapatmak için tercih edilen anahtar
`publishing_paused`'dır.

## 6. Kontrol komutu

```sh
ISPATLA_DB=$PWD/state/ispatla.sqlite3 bun -e '
  const { ensureDatabase, opportunityCount, opportunityPoolThreshold, readAutomationLock, getSetting } = await import("./src/server/db.ts");
  ensureDatabase();
  console.log(JSON.stringify({
    pool: opportunityCount(),
    threshold: opportunityPoolThreshold(),
    lock: readAutomationLock(),
    automationPaused: getSetting("automation_paused", "0"),
    publishingPaused: getSetting("publishing_paused", "0"),
    jevMode: getSetting("jev_mode", "off"),
  }, null, 1));
'
```

Beklenen: `lock.owner === "worker"`, `pool > 0`, `threshold <=` en düşük hesap eşiği.
`pool === 0` ise sırayla bak: kaynaklar etkin mi (`source_categories.enabled`),
`threshold` gerçekten hesabın istediği değer mi, postlar 24 saatlik pencerede mi.

## 7. Sorun giderme

| Belirti | Sebep | Çözüm |
| --- | --- | --- |
| Worker `exit 3`, log'da `automation_lock sahibi web` | Panel kendi scheduler'ını çalıştırıyor | Web sürecini `ISPATLA_AUTOMATION=0` ile başlat |
| `ISPATLA_WORKER_IGNORE_LOCK=1` | Kilit sahibi gerçekten ölü | Yalnız o durumda kullan; iki yazıcı aynı anda koşmamalı |
| `flock` hatası | Aynı unit zaten çalışıyor | `systemctl --user status ispatla-worker.service` |
| `pool=0`, `threshold=70` | Hesap eşiği tanımsız | İlgili hesap kategorisine `publishThreshold` ver veya `opportunity_pool_threshold` ayarla |
