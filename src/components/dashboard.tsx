"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleAlert, Database, ExternalLink, FileText, RefreshCw, Send, ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import type { RecentPost } from "@/server/db";
import type { DashboardView } from "@/server/dashboard";
import { ActivityChart } from "@/components/activity-chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatAge(timestamp: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(timestamp * 1000);
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed" || status === "ready") return "default";
  if (status === "blocked" || status === "rejected") return "destructive";
  if (status === "pending_reconciliation") return "secondary";
  return "outline";
}

function PostRow({ post }: { post: RecentPost }) {
  return (
    <TableRow>
      <TableCell className="max-w-[560px]">
        <div className="flex flex-col gap-1">
          <a className="line-clamp-2 font-medium leading-5 hover:underline" href={post.statusUrl} target="_blank" rel="noreferrer">
            {post.text}
          </a>
          <span className="text-xs text-muted-foreground">@{post.sourceHandle} · {formatAge(post.observedAt)}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{Math.round(post.score)}</TableCell>
      <TableCell><Badge variant={post.mediaCount ? "secondary" : "outline"}>{post.mediaCount ? `${post.mediaCount} medya` : "metin"}</Badge></TableCell>
      <TableCell><Badge variant={statusVariant(post.publishStatus)}>{post.publishStatus.replaceAll("_", " ")}</Badge></TableCell>
    </TableRow>
  );
}

function MetricCard({ icon: Icon, label, value, detail, href }: { icon: typeof Activity; label: string; value: string | number; detail: string; href?: string }) {
  const card = (
    <Card className={href ? "transition-colors hover:border-primary/50" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
        <div className="flex flex-col gap-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        </div>
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
  return href ? <Link href={href} aria-label={`${label} listesini aç`}>{card}</Link> : card;
}

export function Dashboard({ initial }: { initial: DashboardView }) {
  const [summary, setSummary] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) setSummary((await response.json()) as DashboardView);
    });
  }

  function runScan() {
    startTransition(async () => {
      await fetch("/api/scan", { method: "POST" });
      refresh();
    });
  }

  const latestStatus = summary.lastRun?.status || "bekliyor";
  const docs = [
    ["X algorithm news account analysis", "x-algorithm-news-account-analysis.md"],
    ["XPatla site algorithm research", "xpatla-site-algoritma-arastirmasi-2026-08-21.md"],
    ["Research map", "docs/RESEARCH-MAP.md"],
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-flex size-2 rounded-full bg-primary" />
              İspatla / Senin masan
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Bir sonraki gönderin burada başlar.</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">Konularına uygun fırsatları incele, taslağını kendi üslubunla düzenle ve yayın sonuçlarından öğren.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={isPending}>
              {isPending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} Yenile
            </Button>
            <Button onClick={runScan} disabled={isPending}>
              <Activity data-icon="inline-start" aria-hidden="true" /> Şimdi tara
            </Button>
          </div>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="first-step-title">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2"><Badge variant="secondary">{summary.officialX.connectedAccounts ? "Sıradaki adım" : "Hoş geldin"}</Badge></div>
            <h2 id="first-step-title" className="text-lg font-semibold">{!summary.officialX.connectedAccounts ? "Hesabını bağla, konularını birlikte bulalım." : !summary.aiConfigured ? "Taslak hazırlamak için kendi AI sağlayıcını bağla." : "İlk fırsatını seç ve taslağını hazırla."}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{!summary.officialX.connectedAccounts ? "İzin verdiğin profil ve gönderilerinden konu önerileri hazırlanır. Tercihlerini sen onaylarsın; hesap bağlantısı otomatik yayın izni vermez." : !summary.aiConfigured ? "AI anahtarın yalnızca senin isteklerinde kullanılır. Sağlayıcı hazır olduğunda gerçek bir kaynak üzerinden taslak oluşturabilirsin." : "Kaynak bağlantısı ve hesap uyumunu incele. Tahmini performans puanı yayın sonucu değildir; yayınlamak için ayrıca onay vermen gerekir."}</p>
          </div>
          <Link href={!summary.officialX.connectedAccounts ? "/app/accounts" : !summary.aiConfigured ? "/app/settings/keys" : "/app/opportunities"} className={buttonVariants({ variant: "outline", className: "shrink-0" })}>
            {!summary.officialX.connectedAccounts ? "Hesabımı bağla" : !summary.aiConfigured ? "AI ayarlarını aç" : "Fırsatları incele"} <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="İçeriklerin ve bağlantıların">
          <MetricCard icon={Sparkles} label="Senin için fırsatlar" value={summary.opportunities} detail="Kaynak ve uygunluk kanıtını incele" href="/app/opportunities" />
          <MetricCard icon={Send} label="Yayın sonuçların" value={summary.publishedConfirmed} detail="Yayın makbuzu doğrulandı; performans metrikleri ayrıca gözlenir" href="/app/analytics" />
          <MetricCard icon={Bot} label="AI sağlayıcın" value={!summary.aiEnabled ? "Kapalı" : summary.aiConfigured ? "Yapılandırıldı" : "Bağlantı gerekli"} detail="Kendi anahtarını yönet ve bağlantıyı test et" href="/app/settings/keys" />
          <MetricCard icon={ShieldCheck} label="Bağlı X hesapların" value={summary.officialX.connectedAccounts} detail="Bağlantı, konular ve izinlerini yönet" href="/app/accounts" />
        </section>
        <Card><CardHeader><CardTitle>Taslakların</CardTitle><CardDescription>Son üç taslağın. Düzenlemek ve yayına hazırlamak için taslak masanı aç.</CardDescription></CardHeader><CardContent className="space-y-4">
          {summary.recentDrafts.length ? <ul className="divide-y">{summary.recentDrafts.map((draft) => <li key={draft.id} className="py-3"><Link href="/app/drafts" className="line-clamp-2 text-sm leading-6 hover:underline">{draft.text}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Henüz taslağın yok. Bir fırsat seçebilir veya kendi fikrinden başlayabilirsin.</p>}
          <Link href="/app/drafts" className={buttonVariants({ variant: "outline" })}>Taslak masamı aç <ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Link>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Hesabının gelişimi</CardTitle><CardDescription>Hesap bazında ölçümleri ve zaman içindeki değişimi incele. Kaynak gönderilerin hareketi, kendi hesabının büyümesi olarak gösterilmez.</CardDescription></CardHeader><CardContent><Link href="/app/analytics" className={buttonVariants({ variant: "outline" })}>Hesap analizini aç <ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Link></CardContent></Card>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-medium">Gelişmiş analiz ve çalışma durumu</summary><div className="mt-6 flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Teknik metrikler">
          <MetricCard icon={Database} label="Kaynaklar" value={`${summary.sourcesObserved}/${summary.sourcesConfigured}`} detail="Enabled config / state içinde görülen" />
          <MetricCard icon={Activity} label="Gözlenen post" value={summary.postsObserved} detail={`${summary.postsLast24h} son 24 saatte`} />
          <MetricCard icon={Sparkles} label="Fırsatlar" value={summary.opportunities} detail="Skor ≥ 70, sensitive değil · listeyi aç" href="/app/opportunities" />
          <MetricCard icon={Send} label="Reconciliation kuyruğu" value={summary.attemptsPending} detail={`${summary.publishedConfirmed} confirmed · ${summary.publishBlocked} blocked`} />
        </section>

        {!summary.dbAvailable && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>SQLite kullanılamıyor: {summary.dbError || "bilinmeyen hata"}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <CardTitle>Sinyal yoğunluğu</CardTitle>
                  <CardDescription>Son 24 saatte gözlenen içerik ve fırsat eşiğini geçenler.</CardDescription>
                </div>
                <Badge variant={latestStatus === "ok" ? "default" : latestStatus === "partial" ? "secondary" : "outline"}>{latestStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent><ActivityChart data={summary.activity} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operasyon kapıları</CardTitle>
              <CardDescription>Canlı dış sistemlerin kanıtlanabilir durumu.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><TimerReset className="size-4 text-muted-foreground" aria-hidden="true" /> Radar</span><Badge variant={summary.automationRuntime.healthy ? "default" : "outline"}>{summary.automationRuntime.healthy ? `${summary.automationRuntime.owner} heartbeat ${summary.automationRuntime.lagSeconds} sn önce` : "çalışmıyor · heartbeat yok"}</Badge></div>
              <Separator />
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><Bot className="size-4 text-muted-foreground" aria-hidden="true" /> {summary.aiProvider === "codex" ? "Codex" : summary.aiProvider === "compatible" ? "Özel AI endpoint" : "OpenAI Responses"}</span><Badge variant={!summary.aiEnabled ? "secondary" : summary.aiConfigured ? "default" : "destructive"}>{!summary.aiEnabled ? "kapalı" : summary.aiConfigured ? "hazır" : summary.aiProvider === "codex" ? "login yok" : "key / endpoint yok"}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><Send className="size-4 text-muted-foreground" aria-hidden="true" /> Official X grant</span><Badge variant={summary.officialX.postWriteReadyAccounts ? "default" : "secondary"}>{summary.officialX.postWriteReadyAccounts} write hazır</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> Publisher yapılandırması</span><Badge variant={summary.officialPublisherConfigured ? "default" : "destructive"}>{summary.officialPublisherConfigured ? "sunucu hazır" : "sunucu yapılandırması eksik"}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> Açık Auto post izni</span><Badge variant={summary.officialX.autoConsentedPostAccounts ? "default" : "secondary"}>{summary.officialX.autoConsentedPostAccounts} hesap · {summary.officialX.connectedAccounts} bağlı</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> Yayın politikası</span><Badge variant="secondary">≥70 · 6/gün</Badge></div>
              <Alert>
                <ShieldCheck aria-hidden="true" />
                <AlertDescription>Otomatik taslak için bağlı X hesabı, tweet.write yetkisi ve güncel açık post izni gerekir. Her gönderim anında bağlantı, izin ve yayın politikası yeniden denetlenir.</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Son gözlemler</CardTitle>
              <CardDescription>Ham kaynak → score → draft/publish state. Kaynak metni uygulama tarafından kopyalanmaz.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>İçerik</TableHead><TableHead className="text-right">Skor</TableHead><TableHead>Medya</TableHead><TableHead>State</TableHead></TableRow></TableHeader>
                <TableBody>{summary.recentPosts.length ? summary.recentPosts.map((post) => <PostRow key={post.externalId} post={post} />) : <TableRow><TableCell colSpan={4}><Empty className="border-0 py-8"><EmptyHeader><EmptyTitle>Henüz gözlem yok</EmptyTitle><EmptyDescription>Kaynak config’i ekleyip “Şimdi tara” diyebilirsin.</EmptyDescription></EmptyHeader></Empty></TableCell></TableRow>}</TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kaynak haritası</CardTitle>
              <CardDescription>İki araştırma belgesi doğrudan kapsam sözleşmesi olarak korunuyor.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {docs.map(([label, path]) => (
                <a
                  key={path}
                  className={buttonVariants({ variant: "ghost", className: "h-auto w-full justify-start gap-3 border p-3 text-left" })}
                  href={`https://github.com/OnurByte/Ispatla/blob/main/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText data-icon="inline-start" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1"><span className="text-sm font-medium">{label}</span><span className="w-full truncate text-xs text-muted-foreground">{path}</span></span>
                  <ExternalLink data-icon="inline-end" aria-hidden="true" />
                </a>
              ))}
              <Separator />
              <div className="flex flex-col gap-2 text-sm"><span className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" aria-hidden="true" /> Ürün döngüsü</span><span className="text-xs leading-5 text-muted-foreground">Style profile, Market fırsatı, generation, quality/uncertainty/rights gate, Official X publication and feedback reconciliation.</span></div>
              {summary.lastRun && <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground"><span>Son run</span><span className="tabular-nums">{summary.lastRun.postsNew} yeni / {summary.lastRun.postsSeen} görüldü</span></div>}
              <a
                className={buttonVariants({ variant: "link", size: "sm", className: "w-fit px-0" })}
                href="https://github.com/OnurByte/Ispatla"
                target="_blank"
                rel="noreferrer"
              >
                GitHub deposu <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </a>
            </CardContent>
          </Card>
        </section>
        </div></details>
      </div>
    </div>
  );
}
