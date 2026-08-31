"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BrainCircuit, FilePenLine, RefreshCw, Sparkles } from "lucide-react";
import type { Account, MarketInbox, MarketItem, MarketView } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAbortableRequest } from "@/components/use-abortable-request";

type DeskView = Exclude<MarketView, "sensitive">;
const PAGE_SIZE = 50;

function scoreVariant(score: number): "default" | "secondary" | "outline" {
  return score >= 80 ? "default" : score >= 70 ? "secondary" : "outline";
}

function stateLabel(item: MarketItem) {
  if (item.marketStatus === "published") return "Yayınlandı";
  if (item.marketStatus === "drafted") return "Draft üretildi";
  if (item.marketStatus === "queued") return "Reconciliation bekliyor";
  return item.decision === "opportunity" ? "Yayın adayı" : "Gözlendi";
}

function decisionLabel(item: MarketItem) {
  if (item.decision === "opportunity") return "FIRSAT";
  if (item.decision === "below_threshold" || item.decision === "expired") return "ELENDİ";
  if (item.decision === "processed") return "İŞLENDİ";
  if (item.decision === "sensitive") return "HASSAS";
  return "İNCELEME";
}

function decisionReason(item: MarketItem) {
  if (item.decision === "below_threshold") return `Karar skoru ${Math.round(item.score)} / eşik 70.`;
  if (item.decision === "expired") return "Post, 24 saatlik fırsat penceresinin dışında.";
  if (item.decision === "not_eligible_evidence") return "Bu kanıt türü fırsat akışına dahil değil.";
  if (item.decision === "processed") return "Bu post zaten draft, yayın veya reconciliation akışında.";
  if (item.decision === "sensitive") return "Sensitive işareti nedeniyle yayın akışı dışında.";
  return "Karar skoru, momentum ve tazeliğin birlikte hesaplanan sonucudur.";
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

function OpportunityCard({ item, accountId, pending, onGenerate }: { item: MarketItem; accountId: number; pending: string; onGenerate: (externalId: string, accountId: number | null, kind: "example" | "post") => void }) {
  const photo = safePhoto(item.mediaJson);
  const canGenerate = item.decision === "opportunity";
  return <Card size="sm" className="transition-colors hover:border-primary/40">
    {photo ? <img src={photo} alt="Kaynak gönderi görseli" className="max-h-72 w-full object-cover" loading="lazy" /> : null}
    <CardHeader className="gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={item.decision === "opportunity" ? "outline" : item.decision === "sensitive" ? "destructive" : "secondary"}>{decisionLabel(item)}</Badge>
          {item.hit ? <Badge variant="destructive">HIT</Badge> : null}
          <a href={item.statusUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-foreground hover:underline">@{item.sourceHandle}<ArrowUpRight className="size-3" aria-hidden="true" /></a>
          <span>·</span><span>{stateLabel(item)}</span>
        </div>
        <CardTitle className="text-[15px] leading-6 tracking-tight"><a href={item.statusUrl} target="_blank" rel="noreferrer" className="line-clamp-4 hover:underline">{item.text}</a></CardTitle>
      </div>
      <CardAction className="flex shrink-0 flex-col items-end gap-1"><Badge variant={scoreVariant(item.score)} className="text-base tabular-nums">{Math.round(item.score)}</Badge><span className="text-[11px] text-muted-foreground">karar skoru</span></CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="grid grid-cols-2 divide-x rounded-lg border bg-muted/20 sm:grid-cols-5">
        <div className="px-3 py-2"><div className="text-[11px] text-muted-foreground">Momentum</div><div className="font-medium tabular-nums">{item.momentum === 100 ? "100 · tavan" : item.momentum}</div></div>
        <div className="px-3 py-2"><div className="text-[11px] text-muted-foreground">Tazelik</div><div className="font-medium tabular-nums">%{item.freshness}</div></div>
        <div className="px-3 py-2"><div className="text-[11px] text-muted-foreground">Etkileşim/saat</div><div className="font-medium tabular-nums">{item.velocity.toLocaleString("tr-TR")}</div></div>
        <div className="px-3 py-2"><div className="text-[11px] text-muted-foreground">Güvenlik</div><div className={item.sensitive ? "font-medium text-destructive" : "font-medium"}>{item.sensitive ? "Sensitive" : "Sensitive değil"}</div></div>
        <div className="px-3 py-2"><div className="text-[11px] text-muted-foreground">Takipçi oranı</div><div className="font-medium tabular-nums">%{(item.engagementRate * 100).toFixed(2)}</div></div>
      </div>
      <p className="text-xs text-muted-foreground">{decisionReason(item)}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 truncate text-xs text-muted-foreground" title={item.scoreEvidence.reason || "deterministik skor"}><span className="font-medium text-foreground">{item.scoreEvidence.kind}</span>{item.scoreEvidence.reason ? <span> · {item.scoreEvidence.reason}</span> : null}</div>
        {canGenerate ? <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onGenerate(item.externalId, null, "example")} disabled={Boolean(pending)}>{pending === `${item.externalId}:example` ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" aria-hidden="true" />}Örnek post oluştur</Button>
          <Button size="sm" onClick={() => onGenerate(item.externalId, accountId || null, "post")} disabled={!accountId || Boolean(pending)}>{pending === `${item.externalId}:post` ? <Spinner data-icon="inline-start" /> : <FilePenLine data-icon="inline-start" aria-hidden="true" />}Post oluştur</Button>
        </div> : null}
      </div>
    </CardContent>
  </Card>;
}

function emptyState(view: DeskView) {
  if (view === "observed") return ["Son 24 saatte güvenli gözlem yok", "Worker yeni post okumadığında veya yalnız hassas içerik gördüğünde bu liste boş kalır."];
  if (view === "rejected") return ["Elenen post yok", "Gözlenen postlar ya fırsat eşiğini geçti ya da hassas/işlenmiş olarak ayrı tutuluyor."];
  return ["Henüz fırsat yok", "Kaynakları tara; matematiksel eşiği geçen, sensitive olmayan postlar burada listelenir."];
}

export function MarketPage({ initial, accounts }: { initial: MarketInbox; accounts: Account[] }) {
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
    if (!response) { setPendingAction(""); setMessage("İstek durduruldu; güncel görünümü yenileyerek kontrol et."); return; }
    const body = await response.json().catch(() => ({})) as MarketInbox & { error?: string };
    setPendingAction("");
    if (!response.ok) return setMessage(body.error || "Market verisi alınamadı.");
    if (nextView === "sensitive") { setSensitive(body); return; }
    setView(nextView);
    setPage((current) => append ? { ...body, items: [...current.items, ...body.items] } : body);
  }

  async function generate(externalId: string, draftAccountId: number | null, kind: "example" | "post") {
    if (kind === "post" && !draftAccountId) return setMessage("Post oluşturmak için etkin bir yayın hesabı seç.");
    setPendingAction(`${externalId}:${kind}`);
    const response = await run((signal) => fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalId, accountId: draftAccountId, instruction, format: "post" }), signal }));
    if (!response) { setPendingAction(""); setMessage("İstek durduruldu; taslak sunucuda oluşturulmuş olabilir, Taslaklar ekranını yenileyerek kontrol et."); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction("");
    if (!response.ok) return setMessage(body.error || "Draft üretilemedi.");
    const draftId = Number(body.id);
    if (!Number.isInteger(draftId) || draftId <= 0) return setMessage("Draft oluşturuldu fakat editör kimliği alınamadı.");
    router.push(`/drafts?draft=${draftId}`);
  }

  const matchingAccounts = accounts.filter((account) => account.enabled && `${account.handle} ${account.displayName}`.toLocaleLowerCase("tr-TR").includes(accountSearch.toLocaleLowerCase("tr-TR")));
  const [emptyTitle, emptyDescription] = emptyState(view);
  const list = (items: MarketItem[]) => items.length ? <div className="grid gap-3">{items.map((item) => <OpportunityCard key={item.externalId} item={item} accountId={accountId} pending={pendingAction} onGenerate={generate} />)}</div> : <Empty className="border border-dashed py-12"><EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader></Empty>;

  return <div className="flex flex-col gap-5">
    <Alert><BrainCircuit aria-hidden="true" /><AlertDescription>Fırsat, son 24 saatte oluşturulmuş; sensitive olmayan; işlenmemiş ve karar skoru ≥ 70 olan kaynak postudur. Hız ve takipçi oranı FxTwitter&apos;dan gelen gözlenen sayaçlardır; skor X&apos;in iç sıralaması veya erişim garantisi değildir.</AlertDescription></Alert>
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><CardTitle>Fırsat masası</CardTitle><CardDescription>Önce postun kararını gör; yalnız fırsatlarda draft üret.</CardDescription></div>
        <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Post üretimi için özel talimat (opsiyonel): sakin ton, 2 cümle, ekonomik etkisini vurgula" className="min-h-20 sm:max-w-xl" aria-label="Post üretimi özel talimatı" />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={accountId ? String(accountId) : null} onValueChange={(value) => setAccountId(value ? Number(value) : 0)}><SelectTrigger className="w-[190px]" aria-label="Draft hesabı"><SelectValue placeholder="Draft hesabı" /></SelectTrigger><SelectContent><div className="p-1"><Input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Hesap ara..." aria-label="Hesap ara" /></div><SelectGroup>{matchingAccounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle} · {account.displayName}</SelectItem>)}</SelectGroup>{matchingAccounts.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Eşleşen hesap yok.</p>}</SelectContent></Select>
          {pending ? <Button variant="destructive" onClick={abort}>Durdur</Button> : null}
          <Button variant="outline" onClick={() => void load(view)} disabled={pending}><RefreshCw data-icon="inline-start" aria-hidden="true" /> Yenile</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!accountId && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>Hesap olmadan örnek post üretebilirsin; yayın/kuyruk için hesap eşlemen gerekir.</span><Link href="/accounts" className={buttonVariants({ variant: "outline", size: "sm" })}>Hesap ekle</Link></AlertDescription></Alert>}
        <Tabs value={view} onValueChange={(value) => { if (value) void load(value as DeskView); }}>
          <TabsList variant="line"><TabsTrigger value="opportunities">Fırsatlar <Badge variant="outline">{page.counts.opportunities}</Badge></TabsTrigger><TabsTrigger value="observed">Gözlenen 24s <Badge variant="outline">{page.counts.observed}</Badge></TabsTrigger><TabsTrigger value="rejected">Elenen <Badge variant="outline">{page.counts.rejected}</Badge></TabsTrigger></TabsList>
          <TabsContent value="opportunities" className="pt-4">{view === "opportunities" ? list(page.items) : null}</TabsContent>
          <TabsContent value="observed" className="flex flex-col gap-4 pt-4">
            {view === "observed" ? list(page.items) : null}
            {view === "observed" && page.counts.sensitive > 0 ? <details className="rounded-lg border border-dashed p-4" onToggle={(event) => { if (event.currentTarget.open && !sensitive) void load("sensitive"); }}><summary className="cursor-pointer text-sm font-medium">Hassas içerik gizli · {page.counts.sensitive}</summary><p className="mt-2 text-xs text-muted-foreground">Sensitive postlar yayın akışına girmez. Metin ve medya yalnız bu bölümü açtığında gösterilir.</p>{sensitive ? <div className="mt-4 grid gap-3">{sensitive.items.map((item) => <OpportunityCard key={item.externalId} item={item} accountId={0} pending="" onGenerate={generate} />)}</div> : null}</details> : null}
          </TabsContent>
          <TabsContent value="rejected" className="pt-4">{view === "rejected" ? list(page.items) : null}</TabsContent>
        </Tabs>
        {page.items.length < page.total && <Button variant="outline" className="self-start" onClick={() => void load(view, page.items.length, true)} disabled={pending}>{pendingAction === `${view}:${page.items.length}` ? <Spinner data-icon="inline-start" /> : null} Sonraki {PAGE_SIZE}</Button>}
      </CardContent>
    </Card>
    {message && <Alert><FilePenLine aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
