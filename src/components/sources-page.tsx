"use client";

import { useState } from "react";
import { BadgeCheck, Pin, Plus, Radar, RotateCcw, ScanSearch, Save, Trash2, UserRoundCheck } from "lucide-react";
import type { DeletedSource, SourceConfig } from "@/server/db";
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
  ideology: string;
  ideologyTags: string;
};

function blankSource(): SourceDraft {
  return { handle: "", name: "", enabled: true, maxPosts: 20, rightsStatus: "unknown", pinned: true, niche: "", topics: "", tone: "", ideology: "belirsiz", ideologyTags: "" };
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
    ideology: source.profile.ideology || "belirsiz",
    ideologyTags: (source.profile.ideologyTags || []).join(", "),
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

type IdeologyOption = { id: string; name: { en: string; tr: string } };

export function SourcesPage({ initial, initialDeleted, initialWarnings, ideologies }: { initial: SourceConfig[]; initialDeleted: DeletedSource[]; initialWarnings: DeletedSource[]; ideologies: IdeologyOption[] }) {
  const [sources, setSources] = useState(initial);
  const [deleted, setDeleted] = useState<DeletedSource[]>(initialDeleted);
  const [warnings, setWarnings] = useState<DeletedSource[]>(initialWarnings);
  const [ideologyFilter, setIdeologyFilter] = useState("all");
  const firstSource = initial.find((source) => source.profile.status !== "candidate") || initial[0];
  const [draft, setDraft] = useState<SourceDraft>(firstSource ? draftFrom(firstSource) : blankSource());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function reload() {
    const next = await fetch("/api/sources", { cache: "no-store" }).then((response) => response.json() as Promise<SourceConfig[]>);
    setSources(next);
    setDeleted(await fetch("/api/sources?view=deleted", { cache: "no-store" }).then((response) => response.json() as Promise<DeletedSource[]>));
    setWarnings(await fetch("/api/sources?view=warnings", { cache: "no-store" }).then((response) => response.json() as Promise<DeletedSource[]>));
    return next;
  }

  async function save() {
    setPending(true);
    const editing = Boolean(draft.handle && sources.some((source) => source.handle === draft.handle));
    const response = await fetch(editing ? `/api/sources/${draft.handle}` : "/api/sources", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Kaynak kaydedilemedi.");
    const next = await reload();
    const saved = next.find((source) => source.handle === draft.handle);
    if (saved) setDraft(draftFrom(saved));
    setMessage("Kaynak kaydedildi.");
  }

  async function remove() {
    if (!draft.handle) return;
    setPending(true);
    const response = await fetch(`/api/sources/${draft.handle}`, { method: "DELETE" });
    setPending(false);
    setDeleteOpen(false);
    if (!response.ok) return setMessage("Kaynak silinemedi.");
    await reload();
    setDraft(blankSource());
    setMessage("Kaynak silindi; yedi gün yeniden keşfedilmeyecek.");
  }

  async function discover() {
    setScanning(true);
    const response = await fetch("/api/scan", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Keşif taraması çalışmadı.");
    await reload();
    setMessage(`${body.sourcesDiscovered || 0} aday bulundu, ${body.sourcesPromoted || 0} kaynak aktifleştirildi, ${body.sourcesDeleted || 0} kaynak silindi.`);
  }

  async function checkLiveness() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check_liveness" }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Toplu hesap kontrolü çalışmadı.");
    await reload();
    setMessage(`${body.checked || 0} hesap kontrol edildi: ${body.alive || 0} canlı, ${body.deleted || 0} silindi, ${body.unreachable || 0} erişilemedi, ${body.identityWarnings || 0} kimlik uyarısı.`);
  }

  async function recoverTechnical() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recover_technical" }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(body.error || "Teknik kaynak kurtarma çalışmadı.");
    await reload();
    setMessage(`${body.recovered || 0} kaynak geri alındı; ${body.unresolved || 0} kayıt yeniden doğrulama bekliyor.`);
  }

  const active = sources.filter((source) => source.profile.status !== "candidate");
  const candidates = sources.filter((source) => source.profile.status === "candidate");
  const ideologyOptions = ["all", "belirsiz", ...ideologies.map((ideology) => ideology.id)];
  const ideologyName = (id: string) => ideologies.find((ideology) => ideology.id === id)?.name.tr || ideologies.find((ideology) => ideology.id === id)?.name.en || id;

  function sourceList(items: SourceConfig[]) {
    const filtered = ideologyFilter === "all" ? items : items.filter((source) => source.profile.ideology === ideologyFilter || source.profile.ideologyTags?.some((tag) => tag === ideologyFilter));
    if (filtered.length === 0) {
      return (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>Bu bölüm boş</EmptyTitle>
            <EmptyDescription>Keşif taraması yeni hesapları quote, reply ve mention grafiğinden bulur.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={discover} disabled={scanning}><Radar data-icon="inline-start" aria-hidden="true" /> Keşfi çalıştır</Button></EmptyContent>
        </Empty>
      );
    }
    return filtered.map((source) => {
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
            <Badge variant={source.profile.ideology && source.profile.ideology !== "belirsiz" ? "secondary" : "outline"}>{source.profile.ideology || "belirsiz"}</Badge>
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
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Kaynak havuzu</CardTitle>
            <CardDescription>{active.length} aktif · {candidates.length} keşif adayı · Kimlik/transport hatası uyarıdır, eleme değildir.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="outline" onClick={discover} disabled={scanning} aria-label="Yeni kaynakları keşfet" title="Yeni kaynakları keşfet">
              {scanning ? <Spinner /> : <ScanSearch aria-hidden="true" />}
            </Button>
            <Button size="icon" variant="outline" onClick={checkLiveness} disabled={scanning} aria-label="Kaynak hesaplarının canlılığını kontrol et" title="Kaynak canlılığını kontrol et">{scanning ? <Spinner /> : <UserRoundCheck aria-hidden="true" />}</Button>
            <Button size="icon" variant="outline" onClick={recoverTechnical} disabled={scanning || warnings.length === 0} aria-label="Teknik hatayla elenen kaynakları geri al" title="Teknik hatayla elenen kaynakları geri al"><RotateCcw aria-hidden="true" /></Button>
            <Button size="icon" variant="outline" onClick={() => setDraft(blankSource())} aria-label="Yeni kaynak"><Plus aria-hidden="true" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <Select value={ideologyFilter} onValueChange={(value) => setIdeologyFilter(value || "all")}>
              <SelectTrigger className="w-full" aria-label="Kaynak tandans filtresi"><SelectValue placeholder="Tüm tandanslar" /></SelectTrigger>
              <SelectContent><SelectGroup>{ideologyOptions.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "Tüm tandanslar" : ideologyName(value)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          <Tabs defaultValue="active">
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
          <CardTitle>Kaynak edit</CardTitle>
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
              <Badge variant={selected.profile.ideology && selected.profile.ideology !== "belirsiz" ? "secondary" : "outline"}>politik: {selected.profile.ideology || "belirsiz"}</Badge>
              {selected.profile.ideologyTags?.slice(0, 4).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
              {selected.profile.ideologyConfidence !== undefined ? <Badge variant="outline">politik güven {selected.profile.ideologyConfidence}</Badge> : null}
            </div>
          ) : null}
          {selected?.profile.ideologyReason ? <p className="text-xs leading-5 text-muted-foreground">Politik okuma: {selected.profile.ideologyReason}</p> : null}
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
                <FieldLabel htmlFor="source-ideology">Kaynak tandansı</FieldLabel>
                <FieldDescription>Yalnız doğrulanmış katalogdan seçilir; serbest kategori eklenemez.</FieldDescription>
                <Select value={draft.ideology} onValueChange={(value) => setDraft({ ...draft, ideology: value || "belirsiz" })}>
                  <SelectTrigger id="source-ideology" className="w-full" aria-label="Kaynak ideolojisi"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="belirsiz">Belirsiz</SelectItem>{ideologies.map((ideology) => <SelectItem key={ideology.id} value={ideology.id}>{ideology.name.tr || ideology.name.en}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="source-ideology-tags">Tandans etiketleri</FieldLabel>
                <FieldDescription>İsteğe bağlı; Ctrl/Cmd ile en fazla altı katalog ideolojisi seç.</FieldDescription>
                <select id="source-ideology-tags" multiple value={draft.ideologyTags.split(", ").filter(Boolean)} onChange={(event) => setDraft({ ...draft, ideologyTags: Array.from(event.currentTarget.selectedOptions).map((option) => option.value).slice(0, 6).join(", ") })} className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm">
                  {ideologies.map((ideology) => <option key={ideology.id} value={ideology.id}>{ideology.name.tr || ideology.name.en}</option>)}
                </select>
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
            <AlertDialogDescription>Kaynak havuzdan kalıcı silinir. Geçmiş post kanıtları korunur ve hesap yedi gün yeniden keşfedilmez.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>Kaynağı sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
