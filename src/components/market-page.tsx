"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { internalPostUrl } from "@/lib/post-url";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FilePenLine, Info, RefreshCw } from "lucide-react";
import { AiIcon } from "@/components/ai-icon";
import type { Account, MarketInbox, MarketItem, MarketView } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { BrandMark } from "@/components/brand-logo";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAbortableRequest } from "@/components/use-abortable-request";
import { useUiText } from "@/i18n/ui-client";

type DeskView = Exclude<MarketView, "sensitive">;
const PAGE_SIZE = 50;

function scoreVariant(score: number): "default" | "secondary" | "outline" {
  return score >= 80 ? "default" : score >= 70 ? "secondary" : "outline";
}

function stateLabel(item: MarketItem, t: (message: string, params?: Record<string, string | number>) => string) {
  if (item.marketStatus === "published") return t("Published");
  if (item.marketStatus === "drafted") return t("Draft created");
  if (item.marketStatus === "queued") return t("Reconciliation pending");
  return item.decision === "opportunity" ? t("Publication candidate") : t("Observed");
}

function decisionLabel(item: MarketItem, t: (message: string) => string) {
  if (item.decision === "opportunity") return t("Opportunity");
  if (item.decision === "below_threshold" || item.decision === "expired") return t("Rejected");
  if (item.decision === "processed") return t("Processed");
  if (item.decision === "sensitive") return t("Sensitive");
  return t("Review");
}

function decisionReason(item: MarketItem, t: (message: string, params?: Record<string, string | number>) => string) {
  if (item.decision === "below_threshold") return t("Decision score {score} / threshold 70.", { score: Math.round(item.score) });
  if (item.decision === "expired") return t("The post is outside the 24-hour opportunity window.");
  if (item.decision === "not_eligible_evidence") return t("This evidence type is not included in the opportunity feed.");
  if (item.decision === "processed") return t("This post is already in a draft, publication, or reconciliation flow.");
  if (item.decision === "sensitive") return t("Excluded from the publication flow because it is marked sensitive.");
  return t("The decision score is calculated from saved engagement data; details appear in the post viewer.");
}

function safePhoto(mediaJson: string): string | null {
  try {
    const media = JSON.parse(mediaJson) as unknown[];
    const photo = media.find((item) => {
      if (!item || typeof item !== "object") return false;
      const value = item as { type?: unknown; url?: unknown };
      try { return value.type === "photo" && typeof value.url === "string" && new URL(value.url).hostname === "pbs.twimg.com"; } catch { return false; }
    }) as { url?: string } | undefined;
    return photo?.url || null;
  } catch { return null; }
}

function OpportunityCard({ item, accountId, pending, onGenerate, t, locale }: { item: MarketItem; accountId: number; pending: string; onGenerate: (externalId: string, accountId: number | null, kind: "example" | "post") => void; t: (message: string, params?: Record<string, string | number>) => string; locale: string }) {
  const photo = safePhoto(item.mediaJson);
  const canGenerate = item.decision === "opportunity";
  return <Card size="sm" className="transition-colors hover:border-primary/40">
    {photo ? <Image src={photo} alt={t("Source post image")} width={800} height={500} unoptimized className="max-h-72 w-full object-cover" loading="lazy" /> : null}
    <CardHeader className="gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={item.decision === "opportunity" ? "outline" : item.decision === "sensitive" ? "destructive" : "secondary"}>{decisionLabel(item, t)}</Badge>
          {item.hit ? <Badge variant="destructive">{t("Hit")}</Badge> : null}
          <Link href={internalPostUrl(item.externalId)} className="inline-flex items-center gap-1 font-medium hover:text-foreground hover:underline">@{item.sourceHandle}<ArrowUpRight className="size-3" aria-hidden="true" /></Link>
          <span>⁜</span><span>{stateLabel(item, t)}</span>
        </div>
        <CardTitle className="text-[15px] leading-6 tracking-tight"><Link href={internalPostUrl(item.externalId)} className="line-clamp-4 hover:underline">{item.text}</Link></CardTitle>
      </div>
      <CardAction className="flex shrink-0 flex-col items-end gap-1"><Badge variant={scoreVariant(item.score)} className="text-base tabular-nums">{new Intl.NumberFormat(locale).format(Math.round(item.score))}</Badge><span className="text-[11px] text-muted-foreground">{t("Decision score")}</span></CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{decisionReason(item, t)}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 truncate text-xs text-muted-foreground" title={item.scoreEvidence.reason || t("Deterministic score")}><span className="font-medium text-foreground">{t(item.scoreEvidence.kind === "deterministic" ? "Deterministic score" : item.scoreEvidence.kind === "hybrid" ? "Hybrid score" : "Heuristic score")}</span>{item.scoreEvidence.reason ? <span> ⁜ {item.scoreEvidence.reason}</span> : null}</div>
        {canGenerate ? <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onGenerate(item.externalId, null, "example")} disabled={Boolean(pending)}>{pending === `${item.externalId}:example` ? <Spinner data-icon="inline-start" /> : <AiIcon size={16} className="mr-2" />}{t("Create example post")}</Button>
          <Button size="sm" onClick={() => onGenerate(item.externalId, accountId || null, "post")} disabled={!accountId || Boolean(pending)}>{pending === `${item.externalId}:post` ? <Spinner data-icon="inline-start" /> : <FilePenLine data-icon="inline-start" aria-hidden="true" />}{t("Create post")}</Button>
        </div> : null}
      </div>
    </CardContent>
  </Card>;
}

function emptyState(view: DeskView, t: (message: string) => string) {
  if (view === "observed") return [t("No safe observations in the last 24 hours"), t("This list stays empty when the worker has not read new posts or has only seen sensitive content.")];
  if (view === "rejected") return [t("No rejected posts"), t("Observed posts either passed the opportunity threshold or are listed separately as sensitive or processed.")];
  return [t("No opportunities yet"), t("Scan sources; posts that pass the numeric threshold and are not sensitive appear here.")];
}

export function MarketPage({ initial, accounts }: { initial: MarketInbox & { scanAvailable?: boolean }; accounts: Array<Pick<Account, "id" | "handle" | "displayName" | "enabled" | "defaultAccount">> }) {
  const { t, locale } = useUiText();
  const router = useRouter();
  const [view, setView] = useState<DeskView>("opportunities");
  const [page, setPage] = useState(initial);
  const [sensitive, setSensitive] = useState<MarketInbox | null>(null);
  const [accountId, setAccountId] = useState(accounts.find((account) => account.defaultAccount && account.enabled)?.id || accounts.find((account) => account.enabled)?.id || 0);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const { pending, run, abort } = useAbortableRequest();
  const [instruction, setInstruction] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  async function load(nextView: MarketView, offset = 0, append = false) {
    setPendingAction(`${nextView}:${offset}`);
    const response = await run((signal) => fetch(`/api/market?view=${nextView}&limit=${PAGE_SIZE}&offset=${offset}`, { cache: "no-store", signal }));
    if (!response) { setPendingAction(""); setMessage(t("Request stopped. Refresh the current view to check its status.")); return; }
    const body = await response.json().catch(() => ({})) as MarketInbox & { error?: string };
    setPendingAction("");
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not load market data."));
    if (nextView === "sensitive") { setSensitive(body); return; }
    setView(nextView);
    setPage((current) => append ? { ...body, items: [...current.items, ...body.items] } : body);
  }

  async function generate(externalId: string, draftAccountId: number | null, kind: "example" | "post") {
    if (kind === "post" && !draftAccountId) return setMessage(t("Select an active publishing account to create a post."));
    setPendingAction(`${externalId}:${kind}`);
    const response = await run((signal) => fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalId, accountId: draftAccountId, instruction, format: "post" }), signal }));
    if (!response) { setPendingAction(""); setMessage(t("Request stopped. The draft may have been created; refresh the drafts page to check.")); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction("");
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not create the draft."));
    const draftId = Number(body.id);
    if (!Number.isInteger(draftId) || draftId <= 0) return setMessage(t("The draft was created, but its editor ID could not be read."));
    router.push(`/drafts?draft=${draftId}`);
  }

  const matchingAccounts = accounts.filter((account) => account.enabled && `${account.handle} ${account.displayName}`.toLocaleLowerCase(locale).includes(accountSearch.toLocaleLowerCase(locale)));
  const [emptyTitle, emptyDescription] = emptyState(view, t);
  const list = (items: MarketItem[]) => items.length ? <div className="grid gap-3">{items.map((item) => <OpportunityCard key={item.externalId} item={item} accountId={accountId} pending={pendingAction} onGenerate={generate} t={t} locale={locale} />)}</div> : <Empty className="border border-dashed py-12"><BrandMark size={64} className="mx-auto" /><EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader></Empty>;

  return <div className="flex flex-col gap-5">
    {initial.scanAvailable === false ? <Alert><AlertDescription>{t("The source scanning worker has not completed its PostgreSQL migration. This view contains PostgreSQL observations; the old archive is not used.")}</AlertDescription></Alert> : null}
    <Alert><Info aria-hidden="true" /><AlertDescription>{t("An opportunity is a source post from the last 24 hours that is not sensitive or processed and has a decision score of at least 70. Velocity and follower ratio are observed counters from FxTwitter; the score is not 𝕏's internal ranking or a guarantee of reach.")}</AlertDescription></Alert>
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><CardTitle>{t("Opportunity desk")}</CardTitle><CardDescription>{t("Review the post decision first; create drafts only for opportunities.")}</CardDescription></div>
        <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t("Optional instruction for post generation: calm tone, two sentences, emphasize the economic impact")} className="min-h-20 sm:max-w-xl" aria-label={t("Custom post generation instructions")} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={accountId ? String(accountId) : null} onValueChange={(value) => setAccountId(value ? Number(value) : 0)}><SelectTrigger className="w-[190px]" aria-label={t("Draft account")}><SelectValue placeholder={t("Draft account")}>{accounts.find((account) => account.id === accountId) ? `@${accounts.find((account) => account.id === accountId)!.handle}` : t("Draft account")}</SelectValue></SelectTrigger><SelectContent><div className="p-1"><Input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder={t("Search accounts...")} aria-label={t("Search accounts")} /></div><SelectGroup>{matchingAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle} ⁜ {account.displayName}</SelectItem>)}</SelectGroup>{matchingAccounts.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{t("No matching accounts")}</p>}</SelectContent></Select>
          {pending ? <Button variant="destructive" onClick={abort}>{t("Stop")}</Button> : null}
          <Button variant="outline" onClick={() => void load(view)} disabled={pending}><RefreshCw data-icon="inline-start" aria-hidden="true" /> {t("Refresh")}</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!accountId && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t("You can create an example post without an account; connect an account to publish or queue posts.")}</span><Link href="/accounts" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Add account")}</Link></AlertDescription></Alert>}
        <Tabs value={view} onValueChange={(value) => { if (value) void load(value as DeskView); }}>
          <TabsList variant="line"><TabsTrigger value="opportunities">{t("Opportunities")} <Badge variant="outline">{new Intl.NumberFormat(locale).format(page.counts.opportunities)}</Badge></TabsTrigger><TabsTrigger value="observed">{t("Observed 24h")} <Badge variant="outline">{new Intl.NumberFormat(locale).format(page.counts.observed)}</Badge></TabsTrigger><TabsTrigger value="rejected">{t("Rejected")} <Badge variant="outline">{new Intl.NumberFormat(locale).format(page.counts.rejected)}</Badge></TabsTrigger></TabsList>
          <TabsContent value="opportunities" className="pt-4">{view === "opportunities" ? list(page.items) : null}</TabsContent>
          <TabsContent value="observed" className="flex flex-col gap-4 pt-4">
            {view === "observed" ? list(page.items) : null}
            {view === "observed" && page.counts.sensitive > 0 ? <details className="rounded-lg border border-dashed p-4" onToggle={(event) => { if (event.currentTarget.open && !sensitive) void load("sensitive"); }}><summary className="cursor-pointer text-sm font-medium">{t("Sensitive content hidden ⁜ {count}", { count: new Intl.NumberFormat(locale).format(page.counts.sensitive) })}</summary><p className="mt-2 text-xs text-muted-foreground">{t("Sensitive posts are excluded from publication. Text and media appear only when you open this section.")}</p>{sensitive ? <div className="mt-4 grid gap-3">{sensitive.items.map((item) => <OpportunityCard key={item.externalId} item={item} accountId={0} pending="" onGenerate={generate} t={t} locale={locale} />)}</div> : null}</details> : null}
          </TabsContent>
          <TabsContent value="rejected" className="pt-4">{view === "rejected" ? list(page.items) : null}</TabsContent>
        </Tabs>
        {page.items.length < page.total && <Button variant="outline" className="self-start" onClick={() => void load(view, page.items.length, true)} disabled={pending}>{pendingAction === `${view}:${page.items.length}` ? <Spinner data-icon="inline-start" /> : null} {t("Next {count}", { count: PAGE_SIZE })}</Button>}
      </CardContent>
    </Card>
    {message && <Alert><FilePenLine aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
