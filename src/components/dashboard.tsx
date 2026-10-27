"use client";
import {useUiText} from "@/i18n/ui-client";
import {localizePath,type Locale} from "@/i18n/config";
import { BrandText } from "@/components/brand-text";

import { useState, useTransition } from "react";
import Link from "next/link";
import { internalPostUrl } from "@/lib/post-url";
import { Activity, ArrowUpRight, CheckCircle2, CircleAlert, Database, ExternalLink, FileText, Radar, RefreshCw, Send, ShieldCheck, TimerReset } from "lucide-react";
import type { ComponentType } from "react";
import { AiIcon } from "@/components/ai-icon";
import type { RecentPost } from "@/server/db-types";
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

function formatAge(timestamp: number, locale:Locale): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(timestamp * 1000);
}

function formatNumber(value:number,locale:Locale):string { return new Intl.NumberFormat(locale).format(value); }

function displayStatus(status:string,t:(message:string)=>string):string {
  const labels:Record<string,string>={ok:"Completed",partial:"Partial",skipped:"Skipped",bekliyor:"Waiting",published:"Published",drafted:"Draft created",queued:"Queued",new:"New",ignored:"Ignored",observed:"Observed",confirmed:"Confirmed",blocked:"Blocked",ready:"Ready",failed:"Failed",pending_approval:"Awaiting approval",pending_reconciliation:"Reconciliation pending",reconciliation_required:"Reconciliation required",dispatching:"Sending",expired:"Expired",rejected:"Rejected",sensitive:"Sensitive",opportunity:"Opportunity",below_threshold:"Rejected",not_eligible_evidence:"Ineligible evidence",processed:"Processed"};
  return t(labels[status]||status);
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["confirmed", "ready", "published", "drafted"].includes(status)) return "default";
  if (["blocked", "rejected", "failed"].includes(status)) return "destructive";
  if (["queued", "pending_reconciliation", "pending_approval", "dispatching"].includes(status)) return "secondary";
  return "outline";
}

function PostRow({ post }: { post: RecentPost }) {
  const {t,locale}=useUiText();
  return (
    <TableRow>
      <TableCell className="max-w-[560px]">
        <div className="flex flex-col gap-1">
          <Link className="line-clamp-2 font-medium leading-5 hover:underline" href={localizePath(locale,internalPostUrl(post.externalId))}>
            {post.text}
          </Link>
          <span className="text-xs text-muted-foreground">@{post.sourceHandle} ⁜ {formatAge(post.observedAt,locale)}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(Math.round(post.score),locale)}</TableCell>
      <TableCell><Badge variant={post.mediaCount ? "secondary" : "outline"}>{post.mediaCount ? t("{count} media",{count:formatNumber(post.mediaCount,locale)}) : t("Text")}</Badge></TableCell>
      <TableCell><Badge variant={statusVariant(post.publishStatus)}>{displayStatus(post.publishStatus,t)}</Badge></TableCell>
    </TableRow>
  );
}

function MetricCard({ icon: Icon, label, value, detail, href }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number; detail: string; href?: string }) {
  const {locale}=useUiText();
  const card = (
    <Card className={href ? "transition-colors hover:border-primary/50" : undefined}>
      <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
        <div className="flex flex-col gap-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{typeof value === "number" ? formatNumber(value,locale) : value}</CardTitle>
        </div>
        <Icon className="size-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
  return href ? <Link href={localizePath(locale,href)}>{card}</Link> : card;
}

export function Dashboard({ initial, canRunScan }: { initial: DashboardView; canRunScan: boolean }) {
  const {t,locale}=useUiText();
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

  const latestStatus = displayStatus(summary.lastRun?.status || "bekliyor",t);
  const docs = [
    [t("𝕏 algorithm news account analysis"), "x-algorithm-news-account-analysis.md"],
    [t("𝕏Patla site algorithm research"), "xpatla-site-algoritma-arastirmasi-2026-08-21.md"],
    [t("Research map"), "docs/RESEARCH-MAP.md"],
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="site-container flex flex-col gap-8 py-6 lg:py-10">
        <header className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-flex size-2 rounded-full bg-primary" />
              <BrandText text={t("ispatla.tr / Senin masan")} />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("Bir sonraki gönderin burada başlar.")}</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">{t("Konularına uygun fırsatları incele, taslağını kendi üslubunla düzenle ve yayın sonuçlarından öğren.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={isPending}>
              {isPending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} {t("Refresh")}</Button>
            {canRunScan ? <Button onClick={runScan} disabled={isPending}>
              <Activity data-icon="inline-start" aria-hidden="true" /> {t("Şimdi tara")}</Button> : null}
          </div>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="first-step-title">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2"><Badge variant="secondary">{summary.officialX.connectedAccounts ? t("Sıradaki adım") : t("Hoş geldin")}</Badge></div>
            <h2 id="first-step-title" className="text-lg font-semibold">{!summary.officialX.connectedAccounts ? t("Hesabını bağla, konularını birlikte bulalım.") : !summary.aiConfigured ? t("Taslak hazırlamak için kendi AI sağlayıcını bağla.") : t("İlk fırsatını seç ve taslağını hazırla.")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{!summary.officialX.connectedAccounts ? t("We suggest topics from your public profile and posts. You can edit your preferences; adding an account does not grant automatic publishing permission.") : !summary.aiConfigured ? t("Your AI key is used only for your requests. Once your provider is ready, you can create a draft from a real source.") : t("Review source connections and account fit. Estimated performance scores are not publishing results; publishing still requires your approval.")}</p>
          </div>
          <Link href={localizePath(locale,!summary.officialX.connectedAccounts ? "/accounts" : !summary.aiConfigured ? "/settings/keys" : "/opportunities")} className={buttonVariants({ variant: "outline", className: "shrink-0" })}>
            {!summary.officialX.connectedAccounts ? t("Hesabımı bağla") : !summary.aiConfigured ? t("AI ayarlarını aç") : t("Fırsatları incele")} <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-label={t("Your content and connections")}>
          <MetricCard icon={Radar} label={t("Senin için fırsatlar")} value={summary.opportunities} detail={t("Kaynak ve uygunluk kanıtını incele")} href={localizePath(locale,"/opportunities")} />
          <MetricCard icon={Send} label={t("Your publishing results")} value={summary.publishedConfirmed} detail={t("Publication receipts are confirmed; performance metrics are observed separately.")} href={localizePath(locale,"/analytics")} />
          <MetricCard icon={AiIcon} label={t("AI sağlayıcın")} value={!summary.aiEnabled ? t("Kapalı") : summary.aiConfigured ? t("Yapılandırıldı") : t("Bağlantı gerekli")} detail={t("Kendi anahtarını yönet ve bağlantıyı test et")} href={localizePath(locale,"/settings/keys")} />
          <MetricCard icon={ShieldCheck} label={t("Bağlı 𝕏 hesapların")} value={summary.officialX.connectedAccounts} detail={t("Bağlantı, konular ve izinlerini yönet")} href={localizePath(locale,"/accounts")} />
        </section>
        <Card><CardHeader><CardTitle>{t("Taslakların")}</CardTitle><CardDescription>{t("Son üç taslağın. Düzenlemek ve yayına hazırlamak için taslak masanı aç.")}</CardDescription></CardHeader><CardContent className="space-y-4">
          {summary.recentDrafts.length ? <ul className="divide-y">{summary.recentDrafts.map((draft) => <li key={draft.id} className="py-3"><Link href={localizePath(locale,`/drafts?draft=${draft.id}`)} className="line-clamp-2 text-sm leading-6 hover:underline">{draft.text}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("Henüz taslağın yok. Bir fırsat seçebilir veya kendi fikrinden başlayabilirsin.")}</p>}
          <Link href={localizePath(locale,"/drafts")} className={buttonVariants({ variant: "outline" })}>{t("Taslak masamı aç")}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Link>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t("Your account growth")}</CardTitle><CardDescription>{t("Review account-level metrics and changes over time. Activity on source posts is not shown as growth for your own account.")}</CardDescription></CardHeader><CardContent><Link href={localizePath(locale,"/analytics")} className={buttonVariants({ variant: "outline" })}>{t("Open account analytics")}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Link></CardContent></Card>
        <details className="rounded-xl border p-5"><summary className="cursor-pointer font-medium">{t("Gelişmiş analiz ve çalışma durumu")}</summary><div className="mt-6 flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label={t("Teknik metrikler")}>
          <MetricCard icon={Database} label={t("Sources")} value={t("{observed} / {configured}",{observed:formatNumber(summary.sourcesObserved,locale),configured:formatNumber(summary.sourcesConfigured,locale)})} detail={t("Configured / observed sources")} />
          <MetricCard icon={Activity} label={t("Gözlenen post")} value={summary.postsObserved} detail={t("{count} in the last 24 hours",{count:formatNumber(summary.postsLast24h,locale)})} />
          <MetricCard icon={Radar} label={t("Opportunities")} value={summary.opportunities} detail={t("Score ≥ 70, not sensitive ⁜ open list")} href={localizePath(locale,"/opportunities")} />
          <MetricCard icon={Send} label={t("Reconciliation kuyruğu")} value={summary.attemptsPending} detail={t("{confirmed} confirmed ⁜ {blocked} blocked",{confirmed:formatNumber(summary.publishedConfirmed,locale),blocked:formatNumber(summary.publishBlocked,locale)})} />
        </section>

        {!summary.dbAvailable && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t("Veritabanı kullanılamıyor:")}{summary.dbError || t("Unknown error")}</AlertDescription>
          </Alert>
        )}
        {!summary.historicalAnalyticsAvailable && <Alert><Database aria-hidden="true" /><AlertDescription>{t("Historical analytics have not been migrated to PostgreSQL; no historical results are shown yet.")}</AlertDescription></Alert>}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <CardTitle>{t("Sinyal yoğunluğu")}</CardTitle>
                  <CardDescription>{t("Son 24 saatte gözlenen içerik ve fırsat eşiğini geçenler.")}</CardDescription>
                </div>
                <Badge variant={summary.lastRun?.status === "ok" ? "default" : summary.lastRun?.status === "partial" ? "secondary" : "outline"}>{latestStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent><ActivityChart data={summary.activity} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Operasyon kapıları")}</CardTitle>
              <CardDescription>{t("Canlı dış sistemlerin kanıtlanabilir durumu.")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><TimerReset className="size-4 text-muted-foreground" aria-hidden="true" /> {t("Radar")}</span><Badge variant={summary.automationRuntime.healthy ? "default" : "outline"}>{summary.automationRuntime.healthy ? t("{owner} heartbeat {seconds} seconds ago",{owner:summary.automationRuntime.owner,seconds:formatNumber(summary.automationRuntime.lagSeconds||0,locale)}) : t("Not running ⁜ no heartbeat")}</Badge></div>
              <Separator />
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><AiIcon size={16} className="text-muted-foreground" /> {summary.aiProvider === "codex" ? "Codex" : summary.aiProvider === "compatible" ? t("Custom AI endpoint") : summary.aiProvider === "chatgpt" ? t("ChatGPT plan") : summary.aiProvider === "anthropic" ? "Claude API" : "OpenAI Responses"}</span><Badge variant={!summary.aiEnabled ? "secondary" : summary.aiConfigured ? "default" : "destructive"}>{!summary.aiEnabled ? t("Off") : summary.aiConfigured ? t("Ready") : summary.aiProvider === "codex" ? t("Login required") : t("API key or endpoint required")}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><Send className="size-4 text-muted-foreground" aria-hidden="true" /> {t("Official 𝕏 permission")}</span><Badge variant={summary.officialX.postWriteReadyAccounts ? "default" : "secondary"}>{formatNumber(summary.officialX.postWriteReadyAccounts,locale)} {t("Write-ready")}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> {t("Publisher configuration")}</span><Badge variant={summary.officialPublisherConfigured ? "default" : "destructive"}>{summary.officialPublisherConfigured ? t("Server ready") : t("Server configuration missing")}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> {t("Explicit auto-post consent")}</span><Badge variant={summary.officialX.autoConsentedPostAccounts ? "default" : "secondary"}>{t("{consented} accounts ⁜ {connected} connected",{consented:formatNumber(summary.officialX.autoConsentedPostAccounts,locale),connected:formatNumber(summary.officialX.connectedAccounts,locale)})}</Badge></div>
              <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" /> {t("Publishing policy")}</span><Badge variant="secondary">{t("≥70 ⁜ 6/day")}</Badge></div>
              <Alert>
                <ShieldCheck aria-hidden="true" />
                <AlertDescription>{t("Automatic drafting requires a connected 𝕏 account, tweet.write permission, and current explicit post consent. The connection, consent, and publishing policy are checked again for every send.")}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t("Recent observations")}</CardTitle>
              <CardDescription>{t("Raw source → score → draft/publish state. Source text is not copied by the application.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{t("Content")}</TableHead><TableHead className="text-right">{t("Score")}</TableHead><TableHead>{t("Media")}</TableHead><TableHead>{t("Status")}</TableHead></TableRow></TableHeader>
                <TableBody>{summary.recentPosts.length ? summary.recentPosts.map((post) => <PostRow key={post.externalId} post={post} />) : <TableRow><TableCell colSpan={4}><Empty className="border-0 py-8"><EmptyHeader><EmptyTitle>{t("No observations yet")}</EmptyTitle><EmptyDescription>{t("Add a source configuration, then choose Scan now.")}</EmptyDescription></EmptyHeader></Empty></TableCell></TableRow>}</TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Source map")}</CardTitle>
              <CardDescription>{t("The two research documents are retained as direct scope references.")}</CardDescription>
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
              <div className="flex flex-col gap-2 text-sm"><span className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" aria-hidden="true" /> {t("Product cycle")}</span><span className="text-xs leading-5 text-muted-foreground">{t("Style profile, market opportunity, generation, quality/uncertainty/rights gate, official 𝕏 publishing, and feedback reconciliation.")}</span></div>
              {summary.lastRun && <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground"><span>{t("Latest scan")}</span><span className="tabular-nums">{t("{newCount} new ⁜ {seenCount} seen",{newCount:formatNumber(summary.lastRun.postsNew,locale),seenCount:formatNumber(summary.lastRun.postsSeen,locale)})}</span></div>}
              <a
                className={buttonVariants({ variant: "link", size: "sm", className: "w-fit px-0" })}
                href="https://github.com/OnurByte/Ispatla"
                target="_blank"
                rel="noreferrer"
              >
                {t("GitHub repository")}<ArrowUpRight data-icon="inline-end" aria-hidden="true" />
              </a>
            </CardContent>
          </Card>
        </section>
        </div></details>
      </div>
    </div>
  );
}
