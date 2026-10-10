"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Pin, Plus, RotateCcw, RotateCw, ScanSearch, Save, Trash2, UserRoundCheck } from "lucide-react";
import type { DeletedSource, SourceConfig } from "@/server/db-types";
import type { AccountCategoryConfig, SourceCategoryConfig } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SourceDraft = Pick<SourceConfig, "handle" | "name" | "enabled" | "maxPosts" | "rightsStatus"> & {
  pinned: boolean;
  niche: string;
  topics: string;
  tone: string;
};

function blankSource(): SourceDraft {
  return { handle: "", name: "", enabled: true, maxPosts: 20, rightsStatus: "unknown", pinned: true, niche: "", topics: "", tone: "" };
}

function draftFrom(source: SourceConfig): SourceDraft {
  return {
    handle: source.handle,
    name: source.name,
    enabled: source.enabled,
    maxPosts: source.maxPosts,
    rightsStatus: source.rightsStatus,
    pinned: source.profile.pinned === true,
    niche: source.profile.niche || "",
    topics: (source.profile.topics || []).join(", "),
    tone: source.profile.tone || "",
  };
}

function initials(source: SourceConfig): string {
  return (source.name || source.handle).split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("tr-TR");
}

function verificationLabel(status: SourceConfig["profile"]["blueCheckStatus"]): string {
  return ({ blue: "Mavi doğrulama", organization: "Kuruluş doğrulaması", government: "Devlet doğrulaması", not_verified: "Doğrulanmamış", unknown: "Bilinmiyor" })[status || "unknown"];
}

function verificationClass(status: SourceConfig["profile"]["blueCheckStatus"]): string {
  return status === "blue" ? "text-primary" : status === "organization" ? "text-amber-600" : status === "government" ? "text-indigo-600" : "text-muted-foreground";
}

type SourceAccount = { id: number; handle: string; displayName: string };

export function SourcesPage({ accounts, initial, initialAvailable, initialDeleted, initialWarnings }: { accounts: SourceAccount[]; initial: SourceConfig[]; initialAvailable: SourceConfig[]; initialDeleted: DeletedSource[]; initialWarnings: DeletedSource[] }) {
  const [sources, setSources] = useState(initial);
  const [available, setAvailable] = useState(initialAvailable);
  const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
  const [sourceToAdd, setSourceToAdd] = useState("");
  const [accountCategories, setAccountCategories] = useState<AccountCategoryConfig[]>([]);
  const [sourceCategoryIds, setSourceCategoryIds] = useState<number[]>([]);
  const [deleted, setDeleted] = useState<DeletedSource[]>(initialDeleted);
  const [warnings, setWarnings] = useState<DeletedSource[]>(initialWarnings);
  const firstSource = initial.find((source) => source.profile.status !== "candidate") || initial[0];
  const [draft, setDraft] = useState<SourceDraft>(firstSource ? draftFrom(firstSource) : blankSource());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let current = true;
    Promise.all([
      fetch(`/api/accounts/${accountId}/categories`, { cache: "no-store" }).then((response) => response.json() as Promise<AccountCategoryConfig[]>),
      draft.handle ? fetch(`/api/sources/${draft.handle}/categories?accountId=${accountId}`, { cache: "no-store" }).then((response) => response.json() as Promise<SourceCategoryConfig[]>) : Promise.resolve([]),
    ]).then(([categories, mappings]) => {
      if (!current) return;
      setAccountCategories(categories.filter((category) => category.enabled));
      setSourceCategoryIds(mappings.filter((mapping) => mapping.enabled).map((mapping) => mapping.categoryId));
    }).catch(() => {
      if (current) { setAccountCategories([]); setSourceCategoryIds([]); }
    });
    return () => { current = false; };
  }, [accountId, draft.handle]);

  async function reload(forAccountId = accountId) {
    if (!forAccountId) return [];
    const query = `accountId=${forAccountId}`;
    const [next, nextAvailable, nextDeleted, nextWarnings] = await Promise.all([
      fetch(`/api/sources?${query}`, { cache: "no-store" }).then((response) => response.json() as Promise<SourceConfig[]>),
      fetch(`/api/sources?${query}&view=available`, { cache: "no-store" }).then((response) => response.json() as Promise<SourceConfig[]>),
      fetch(`/api/sources?${query}&view=deleted`, { cache: "no-store" }).then((response) => response.json() as Promise<DeletedSource[]>),
      fetch(`/api/sources?${query}&view=warnings`, { cache: "no-store" }).then((response) => response.json() as Promise<DeletedSource[]>),
    ]);
    setSources(next);
    setAvailable(nextAvailable);
    setDeleted(nextDeleted);
    setWarnings(nextWarnings);
    return next;
  }

  async function switchAccount(nextAccountId: string | null) {
    const id = Number(nextAccountId);
    if (!accounts.some((account) => account.id === id)) return;
    setAccountId(id);
    setDraft(blankSource());
    await reload(id);
  }

  async function addSource() {
    if (!accountId || !sourceToAdd) return;
    setPending(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "select", accountId, handle: sourceToAdd }) });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Kaynak hesaba eklenemedi.");
    const next = await reload();
    const source = next.find((item) => item.handle === sourceToAdd);
    if (source) setDraft(draftFrom(source));
    setSourceToAdd("");
    setMessage("Kaynak bu yayın hesabına eklendi.");
  }

  async function save() {
    setPending(true);
    const editing = Boolean(draft.handle && sources.some((source) => source.handle === draft.handle));
    const response = await fetch(editing ? `/api/sources/${draft.handle}` : "/api/sources", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, accountId }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Kaynak kaydedilemedi.");
    if (draft.handle && !(await saveSourceCategories(draft.handle))) return setMessage("Kaynak kaydedildi ancak kategori eşleşmeleri kaydedilemedi.");
    const next = await reload();
    const saved = next.find((source) => source.handle === draft.handle);
    if (saved) setDraft(draftFrom(saved));
    setMessage("Kaynak kaydedildi.");
  }

  async function saveSourceCategories(handle: string) {
    const url = `/api/sources/${handle}/categories?accountId=${accountId}`;
    const existing = await fetch(url, { cache: "no-store" }).then((response) => response.json() as Promise<SourceCategoryConfig[]>);
    const results = await Promise.all([
      ...existing.filter((mapping) => !sourceCategoryIds.includes(mapping.categoryId)).map((mapping) => fetch(`${url}&categoryId=${mapping.categoryId}`, { method: "DELETE" })),
      ...sourceCategoryIds.filter((id) => !existing.some((mapping) => mapping.categoryId === id)).map((categoryId) => fetch(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, categoryId, enabled: true, monitoringTier: "C", discoveryWeight: 1, categoryReputation: null, lastEvidenceAt: Math.floor(Date.now() / 1000) }) })),
    ]);
    return results.every((response) => response.ok);
  }

  async function remove() {
    if (!draft.handle) return;
    setPending(true);
    const response = await fetch(`/api/sources/${draft.handle}?accountId=${accountId}`, { method: "DELETE" });
    setPending(false);
    setDeleteOpen(false);
    if (!response.ok) return setMessage("Kaynak silinemedi.");
    await reload();
    setDraft(blankSource());
    setMessage("Kaynak bu yayın hesabından kaldırıldı.");
  }

  async function scanSources() {
    setScanning(true);
    const response = await fetch("/api/scan", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Kaynak taraması çalışmadı.");
    await reload();
    setMessage(`${body.postsNew || 0} yeni post bulundu; ${body.sourcesScored || 0} AI kaynak skoru güncellendi.`);
  }

  async function checkLiveness() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check_liveness", accountId }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Toplu hesap kontrolü çalışmadı.");
    await reload();
    setMessage(`${body.checked || 0} hesap kontrol edildi: ${body.alive || 0} canlı, ${body.deleted || 0} silindi, ${body.unreachable || 0} erişilemedi, ${body.identityWarnings || 0} kimlik uyarısı.`);
  }

  async function recoverTechnical() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recover_technical", accountId }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Teknik kaynak kurtarma çalışmadı.");
    await reload();
    setMessage(`${body.recovered || 0} kaynak geri alındı; ${body.unresolved || 0} kayıt yeniden doğrulama bekliyor.`);
  }

  async function resetSources() {
    setPending(true);
    try {
      const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset", accountId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error || "Kaynak havuzu sıfırlanamadı.");
      const next = await reload();
      const first = next.find((source) => source.profile.status !== "candidate") || next[0];
      setDraft(first ? draftFrom(first) : blankSource());
      setMessage("Bu yayın hesabının kaynak seçimi temizlendi.");
      setResetOpen(false);
    } catch {
      setMessage("Kaynak havuzu sıfırlanamadı. Bağlantıyı kontrol edip yeniden deneyin.");
    } finally {
      setPending(false);
    }
  }

  const active = sources.filter((source) => source.profile.status !== "candidate");
  const candidates = sources.filter((source) => source.profile.status === "candidate");

  function sourceList(items: SourceConfig[]) {
    if (items.length === 0) {
      return (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>Bu bölüm boş</EmptyTitle>
          <EmptyDescription>Kaynak havuzuna yalnız başlangıçtaki AI hesapları ve elle eklediklerin girer.</EmptyDescription>
        </EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={() => setDraft(blankSource())}><Plus data-icon="inline-start" aria-hidden="true" /> 𝕏 hesabı ekle</Button></EmptyContent>
        </Empty>
      );
    }
    return items.map((source) => {
      const selected = draft.handle === source.handle;
      const identityValid = source.profile.identityHandle === source.handle;
      const score = Number(source.profile.sourceScore || 0);
      return (
        <Button
          key={source.handle}
          type="button"
          variant={selected ? "secondary" : "ghost"}
          className="h-auto min-h-20 justify-start gap-3 border border-transparent p-3 text-left"
          data-selected={selected}
          onClick={() => setDraft(draftFrom(source))}
        >
          <Avatar size="lg">
            {identityValid && source.profile.avatarUrl ? <AvatarImage src={source.profile.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(source)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="flex w-full items-center gap-2">
              <span className="flex items-center gap-1 truncate font-medium">{identityValid ? source.name : source.handle}{identityValid && source.profile.blueCheckStatus && source.profile.blueCheckStatus !== "not_verified" && source.profile.blueCheckStatus !== "unknown" ? <BadgeCheck className={verificationClass(source.profile.blueCheckStatus)} aria-label={verificationLabel(source.profile.blueCheckStatus)} /> : null}</span>
              {source.profile.pinned ? <Pin aria-label="Sabitlenmiş kaynak" /> : null}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground">@{source.handle}{identityValid ? ` · ${Number(source.profile.followers || 0).toLocaleString("tr-TR")} takipçi` : " · profil kimliği doğrulanıyor"}</span>
            <span className="w-full truncate text-xs text-muted-foreground">{source.profile.niche || source.profile.topics?.join(" · ") || "Niş tanımlı değil"}</span>
            <Progress value={score} aria-label={`${source.name} kaynak skoru`} className="w-full" />
          </div>
          <span className="flex flex-col items-end gap-1">
            <Badge variant={score >= 70 ? "default" : "outline"}>{score || "—"}</Badge>
            <Badge variant={source.enabled ? "secondary" : "outline"}>{source.profile.status || (source.enabled ? "active" : "kapalı")}</Badge>
          </span>
        </Button>
      );
    });
  }

  const selected = sources.find((source) => source.handle === draft.handle);
  const selectedEvidence = selected ? Number(selected.profile.evidenceWeight || 0) : 0;
  const selectedIsScored = Number(selected?.profile.lastScoredAt || 0) > 0;
  const evidenceLabel = selectedEvidence > 0
    ? `keşif kanıtı ${selectedEvidence}`
    : selected?.profile.origin === "seed"
      ? "keşif kanıtı yok · başlangıç"
      : "kanıt bekleniyor";
  const selectedDescription = selected?.profile.scoreReason || (
    selected?.profile.status === "candidate"
      ? "Keşif adayı; yeterli keşif kanıtı oluşunca AI skoru hesaplanır."
      : "Manuel kaynaklar sabitlenir; otomatik keşif ve silme dışında tutulabilir."
  );

  return (
    <div className="space-y-5">
      {accounts.length ? <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="min-w-64 flex-1"><FieldLabel htmlFor="sources-account">Yayın hesabı</FieldLabel><Select value={String(accountId)} onValueChange={switchAccount}><SelectTrigger id="sources-account" className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.displayName} · @{account.handle}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="min-w-64 flex-1"><FieldLabel htmlFor="account-source-add">Bu hesaba kaynak ekle</FieldLabel><Select value={sourceToAdd} onValueChange={(value) => setSourceToAdd(value || "")}><SelectTrigger id="account-source-add" className="mt-2 w-full"><SelectValue placeholder="Kaynak seç" /></SelectTrigger><SelectContent><SelectGroup>{available.map((source) => <SelectItem key={source.handle} value={source.handle}>@{source.handle} · {source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <Button onClick={addSource} disabled={!sourceToAdd || pending}><Plus data-icon="inline-start" aria-hidden="true" />Ekle</Button>
      </div> : <Alert><AlertDescription>Kaynak bağlamak için önce bir 𝕏 yayın hesabı ekle.</AlertDescription></Alert>}
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>@{accounts.find((account) => account.id === accountId)?.handle || "—"} kaynakları</CardTitle>
            <CardDescription>{active.length} aktif · {candidates.length} keşif adayı · seçimler yalnız bu yayın hesabına uygulanır.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="outline" onClick={() => setResetOpen(true)} disabled={!accountId || pending || scanning} aria-label="Bu hesabın kaynaklarını temizle" title="Bu hesabın kaynaklarını temizle"><RotateCw aria-hidden="true" /></Button>
            <Button size="icon" variant="outline" onClick={scanSources} disabled={!accountId || scanning} aria-label="Kaynak postlarını tara" title="Kaynak postlarını tara">
              {scanning ? <Spinner /> : <ScanSearch aria-hidden="true" />}
            </Button>
            <Button size="icon" variant="outline" onClick={checkLiveness} disabled={!accountId || scanning || sources.length === 0} aria-label="Bu hesaptaki kaynakları kontrol et" title="Bu hesaptaki kaynakları kontrol et">{scanning ? <Spinner /> : <UserRoundCheck aria-hidden="true" />}</Button>
            <Button size="icon" variant="outline" onClick={recoverTechnical} disabled={!accountId || scanning || warnings.length === 0} aria-label="Teknik uyarıları denetle" title="Teknik uyarıları denetle"><RotateCcw aria-hidden="true" /></Button>
            <Button size="icon" variant="outline" onClick={() => setDraft(blankSource())} disabled={!accountId} aria-label="Yeni kaynak"><Plus aria-hidden="true" /></Button>
          </div>
        </CardHeader>
        <CardContent><Tabs defaultValue="active">
            <TabsList variant="line">
              <TabsTrigger value="active">Aktif <Badge variant="outline">{active.length}</Badge></TabsTrigger>
              <TabsTrigger value="candidates">Adaylar <Badge variant="outline">{candidates.length}</Badge></TabsTrigger>
              <TabsTrigger value="warnings">Teknik uyarılar <Badge variant="outline">{warnings.length}</Badge></TabsTrigger>
              <TabsTrigger value="deleted">Kaldırılan <Badge variant="outline">{deleted.length}</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="flex flex-col gap-2 pt-3">{sourceList(active)}</TabsContent>
            <TabsContent value="candidates" className="flex flex-col gap-2 pt-3">{sourceList(candidates)}</TabsContent>
            <TabsContent value="warnings" className="flex flex-col gap-2 pt-3">
              {warnings.length ? warnings.map((item) => <div key={`${item.handle}-${item.deletedAt}`} className="rounded-lg border border-dashed p-3 text-sm"><div className="font-medium">@{item.handle}</div><div className="text-xs text-muted-foreground">{item.reason}</div></div>) : <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Teknik uyarı yok</EmptyTitle><EmptyDescription>Kimlik ve transport hataları burada görünür; kaynak silinmez.</EmptyDescription></EmptyHeader></Empty>}
            </TabsContent>
            <TabsContent value="deleted" className="flex flex-col gap-2 pt-3">
              {deleted.length ? deleted.map((item) => <div key={`${item.handle}-${item.deletedAt}`} className="rounded-lg border border-dashed p-3 text-sm"><div className="font-medium">@{item.handle}</div><div className="text-xs text-muted-foreground">Skor {item.score} · {item.reason || "manuel kaldırma"}</div></div>) : <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Kaldırılan kaynak yok</EmptyTitle><EmptyDescription>Manuel silmeler burada tutulur.</EmptyDescription></EmptyHeader></Empty>}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Kaynak ayarları</CardTitle>
          <CardDescription>{selectedDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {selected ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.profile.origin || "manual"}</Badge>
              <Badge variant="outline">{selected.profile.scoreModel || "skor bekliyor"}</Badge>
              {selectedIsScored ? <Badge variant="outline">güven {Number(selected.profile.sourceConfidence || 0)}</Badge> : <Badge variant="outline">AI skoru bekliyor</Badge>}
              {selectedIsScored ? <Badge variant={Number(selected.profile.sourceRisk || 0) >= 70 ? "destructive" : "outline"}>risk {Number(selected.profile.sourceRisk || 0)}</Badge> : null}
              <Badge variant="outline" title="Seed kaynaklar keşif zinciri olmadan başlangıçta eklenir.">{evidenceLabel}</Badge>
            </div>
          ) : null}
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="source-handle">Handle</FieldLabel>
                <Input id="source-handle" value={draft.handle} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, handle: event.target.value.replace(/^@/, "").toLowerCase() })} placeholder="bpthaber" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-name">Ad</FieldLabel>
                <Input id="source-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="BPT Haber" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-niche">Kaynak nişi</FieldLabel>
                <FieldDescription>Bu hesabın ana konusu; global niş kullanılmaz.</FieldDescription>
                <Input id="source-niche" value={draft.niche} onChange={(event) => setDraft({ ...draft, niche: event.target.value })} placeholder="ör. ekonomi ve finans" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-topics">Alt konular</FieldLabel>
                <FieldDescription>Virgülle ayır.</FieldDescription>
                <Input id="source-topics" value={draft.topics} onChange={(event) => setDraft({ ...draft, topics: event.target.value })} placeholder="borsa, enflasyon, şirketler" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-tone">Kaynak tonu</FieldLabel>
                <Input id="source-tone" value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value })} placeholder="analitik, kısa, eleştirel" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-max">Max post</FieldLabel>
                <FieldDescription>Tek taramada alınacak üst sınır.</FieldDescription>
                <Input id="source-max" type="number" min={1} max={50} value={draft.maxPosts} onChange={(event) => setDraft({ ...draft, maxPosts: Number(event.target.value) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rights">Rights status</FieldLabel>
                <Select value={draft.rightsStatus} onValueChange={(value) => setDraft({ ...draft, rightsStatus: value as SourceDraft["rightsStatus"] })}>
                  <SelectTrigger id="rights" className="w-full" aria-label="Rights status"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="unknown">unknown</SelectItem>
                    <SelectItem value="cleared">cleared</SelectItem>
                    <SelectItem value="prohibited">prohibited</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Bu kaynaktan hangi hesap kategorileri beslensin?</legend>
            {accountCategories.length ? accountCategories.map((category) => <label key={category.categoryId} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={sourceCategoryIds.includes(category.categoryId)} onChange={(event) => setSourceCategoryIds((current) => event.target.checked ? [...new Set([...current, category.categoryId])] : current.filter((id) => id !== category.categoryId))} />{category.categoryName}</label>) : <p className="text-sm text-muted-foreground">Önce bu yayın hesabı için kategori seç.</p>}
          </fieldset>
          <Field orientation="horizontal">
            <FieldContent><FieldLabel htmlFor="source-enabled">Kaynak aktif</FieldLabel><FieldDescription>Aktif kaynaklar intake taramasına dahil edilir.</FieldDescription></FieldContent>
            <Switch id="source-enabled" checked={draft.enabled} onCheckedChange={(value) => setDraft({ ...draft, enabled: value })} />
          </Field>
          <Field orientation="horizontal">
            <FieldContent><FieldLabel htmlFor="source-pinned">Otomatik silmeden koru</FieldLabel><FieldDescription>Sabit kaynaklar düşük AI skoru alsa da silinmez.</FieldDescription></FieldContent>
            <Switch id="source-pinned" checked={draft.pinned} onCheckedChange={(value) => setDraft({ ...draft, pinned: value })} />
          </Field>
          {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} Kaydet</Button>
            {draft.handle ? <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={pending}><Trash2 data-icon="inline-start" aria-hidden="true" /> Sil</Button> : null}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>@{draft.handle} silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>Kaynak yalnızca seçili yayın hesabından çıkarılır. Kaynak kataloğu ve geçmiş post kanıtları korunur.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>Kaynağı sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaynak havuzu varsayılana döndürülsün mü?</AlertDialogTitle>
            <AlertDialogDescription>Bu hesaptaki kaynak ve kategori seçimleri temizlenir. Kaynak kataloğu ve toplanan post geçmişi korunur.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetSources} disabled={pending}>Varsayılana döndür</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
