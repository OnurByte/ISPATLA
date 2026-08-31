"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import type { Account, DraftRecord } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type DraftForm = {
  id?: number;
  externalId: string;
  accountId: number | null;
  format: string;
  text: string;
  status: string;
  gateReason: string;
  sourceHandle: string;
  sourceUrl: string;
  score: number;
};

function asForm(draft?: DraftRecord): DraftForm {
  return draft
    ? { ...draft }
    : {
        externalId: "",
        accountId: null,
        format: "post",
        text: "",
        status: "draft",
        gateReason: "",
        sourceHandle: "",
        sourceUrl: "",
        score: 0,
      };
}

export function selectedDraft(drafts: DraftRecord[], selectedDraftId?: number): DraftRecord | undefined {
  return drafts.find((draft) => draft.id === selectedDraftId) || drafts[0];
}

function AccountPicker({ accounts, selected, onChange }: { accounts: Account[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const enabledAccounts = accounts.filter((account) => account.enabled);
  if (!enabledAccounts.length) {
    return (
      <Empty className="min-h-28 border border-dashed p-4">
        <EmptyHeader><EmptyTitle>Aktif hesap yok</EmptyTitle><EmptyDescription>Batch üretmek için önce bir yayın hesabı eşle.</EmptyDescription></EmptyHeader>
        <EmptyContent><Link href="/accounts" className={buttonVariants({ variant: "outline", size: "sm" })}>Hesap ekle</Link></EmptyContent>
      </Empty>
    );
  }
  return (
    <FieldSet className="grid gap-2 sm:grid-cols-2">
      {enabledAccounts.map((account) => {
        const checked = selected.includes(account.id);
        const checkboxId = `account-${account.id}`;
        return (
          <Field key={account.id} orientation="horizontal" className="rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/5">
            <Checkbox
              id={checkboxId}
              checked={checked}
              onCheckedChange={(value) => onChange(value === true ? [...selected, account.id] : selected.filter((id) => id !== account.id))}
            />
            <FieldContent className="min-w-0">
              <FieldLabel htmlFor={checkboxId} className="min-w-0 cursor-pointer"><span className="truncate text-sm font-medium">@{account.handle}</span></FieldLabel>
              <FieldDescription className="truncate">{account.displayName || account.styleProfile.tone as string || "stil profili yok"}</FieldDescription>
            </FieldContent>
            {account.defaultAccount && <Badge variant="outline">varsayılan</Badge>}
          </Field>
        );
      })}
    </FieldSet>
  );
}

export function DraftsPage({ initial, accounts, selectedDraftId }: { initial: DraftRecord[]; accounts: Account[]; selectedDraftId?: number }) {
  const enabledAccounts = accounts.filter((account) => account.enabled);
  const defaultSelected = enabledAccounts.map((account) => account.id);
  const [drafts, setDrafts] = useState(initial);
  const [form, setForm] = useState<DraftForm>(asForm(selectedDraft(initial, selectedDraftId)));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>(defaultSelected);
  const [variantMode, setVariantMode] = useState<"per_account" | "same_text">("per_account");
  const [prompt, setPrompt] = useState("");
  const [manualText, setManualText] = useState("");
  const [composeMode, setComposeMode] = useState<"generate" | "manual">("generate");
  const [batchDraftIds, setBatchDraftIds] = useState<number[]>([]);

  async function reload() {
    setDrafts(await fetch("/api/drafts", { cache: "no-store" }).then((response) => response.json() as Promise<DraftRecord[]>));
  }

  function update<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setPending(true);
    const response = await fetch(form.id ? `/api/drafts/${form.id}` : "/api/drafts", {
      method: form.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Draft kaydedilemedi.");
    await reload();
    setForm(asForm(body));
    setMessage("Draft kaydedildi.");
  }

  async function generateFromMarket() {
    if (!form.externalId) return setMessage("Market üretimi için external id gerekli; serbest üretimde yukarıdaki brief alanını kullan.");
    setPending(true);
    const response = await fetch("/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalId: form.externalId, accountId: form.accountId, format: form.format }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Üretilemedi.");
    await reload();
    setForm(asForm(body));
    setMessage("Market kaynağından varyant oluşturuldu.");
  }

  async function createBatch() {
    if (!selectedAccounts.length) return setMessage("Batch için en az bir aktif hesap seç.");
    if (composeMode === "generate" && !prompt.trim()) return setMessage("AI üretimi için bir brief yaz.");
    if (composeMode === "manual" && !manualText.trim()) return setMessage("Manuel post metni boş olamaz.");
    setPending(true);
    const response = await fetch("/api/drafts/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: composeMode === "generate" ? prompt : "",
        text: composeMode === "manual" ? manualText : "",
        accountIds: selectedAccounts,
        format: form.format,
        variantMode,
        externalId: form.externalId,
        sourceUrl: form.sourceUrl,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Batch oluşturulamadı.");
    setBatchDraftIds((body.drafts || []).map((draft: DraftRecord) => draft.id));
    setDrafts((current) => [...body.drafts, ...current.filter((draft) => !(body.drafts as DraftRecord[]).some((item) => item.id === draft.id))]);
    setForm(asForm(body.drafts?.[0]));
    setMessage(`${body.drafts.length} hesap için ${variantMode === "per_account" ? "ayrı stil varyantı" : "aynı metin"} hazırlandı.`);
  }

  async function queueBatch() {
    if (!batchDraftIds.length) return setMessage("Önce batch üret.");
    setPending(true);
    const response = await fetch("/api/drafts/batch/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftIds: batchDraftIds }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? `${body.intents?.length || 0} yayın onayı ve ${body.jobs?.length || 0} engagement işi hazırlandı.` : body.error || "Batch kuyruğa alınamadı.");
    if (response.ok) {
      await reload();
      setBatchDraftIds([]);
    }
  }

  async function queue() {
    if (!form.id) return setMessage("Önce draft’ı kaydet.");
    setPending(true);
    const response = await fetch(`/api/drafts/${form.id}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: form.accountId, action: form.format }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Yayın kuyruğuna alındı; çalıştırma ayrı onay adımıdır." : body.error || "Kuyruğa alınamadı.");
    if (response.ok) await reload();
  }

  async function removeDraft() {
    if (!form.id || !window.confirm("Bu draft silinsin mi?")) return;
    setPending(true);
    const response = await fetch(`/api/drafts/${form.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Draft silinemedi.");
    await reload();
    setForm(asForm());
    setMessage("Draft silindi.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Manuel post üret</CardTitle>
          <CardDescription>Brief veya hazır metin gir; seçilen hesaplara hesap başına varyant üret, sonra her hesabı ayrı queue job olarak çalıştır.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button variant={composeMode === "generate" ? "secondary" : "outline"} onClick={() => setComposeMode("generate")}> <Sparkles data-icon="inline-start" aria-hidden="true" /> AI brief</Button>
            <Button variant={composeMode === "manual" ? "secondary" : "outline"} onClick={() => setComposeMode("manual")}>Manuel metin</Button>
          </div>
          {composeMode === "generate" ? (
            <Field>
              <FieldLabel htmlFor="manual-prompt">Ne anlatılsın?</FieldLabel>
              <Textarea id="manual-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Örn. Türkiye'de genç işsizliği hakkında kanıt odaklı, sakin bir original post yaz." className="min-h-28" />
              <FieldDescription>Bu alan AI’a veri olarak gider; tool/shell/SQL komutları çalıştırılmaz.</FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="manual-text">Hazır post</FieldLabel>
              <Textarea id="manual-text" value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="Seçilen hesaplara gönderilecek özgün metin..." className="min-h-28" />
              <FieldDescription className="text-right">{manualText.length}/280</FieldDescription>
            </Field>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
            <Field>
              <FieldLabel>Gönderilecek hesaplar</FieldLabel>
              <AccountPicker accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
            </Field>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="batch-format">Format</FieldLabel>
                <Select value={form.format} onValueChange={(value) => update("format", value ?? "post")}>
                  <SelectTrigger id="batch-format" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">Original post</SelectItem>
                    <SelectItem value="quote">Quote (draft only)</SelectItem>
                    <SelectItem value="reply">Reply (draft only)</SelectItem>
                    <SelectItem value="thread">Thread (draft only)</SelectItem>
                    <SelectItem value="dm">DM (draft only)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border px-3 py-2.5 has-data-checked:border-primary has-data-checked:bg-primary/5">
                <Checkbox id="same-text" checked={variantMode === "same_text"} onCheckedChange={(value) => setVariantMode(value === true ? "same_text" : "per_account")} />
                <FieldContent>
                  <FieldLabel htmlFor="same-text" className="cursor-pointer">Aynı metni kullan</FieldLabel>
                  <FieldDescription>Kapalıyken her hesap stil profiline göre ayrı üretim çağrısı alır.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="batch-source-id">Market external id (opsiyonel)</FieldLabel>
              <Input id="batch-source-id" value={form.externalId} onChange={(event) => update("externalId", event.target.value)} placeholder="Kaynak post id" />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-source-url">Kaynak URL (opsiyonel)</FieldLabel>
              <Input id="batch-source-url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={createBatch} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" aria-hidden="true" />} Batch üret</Button>
            <Button variant="secondary" onClick={queueBatch} disabled={pending || !batchDraftIds.length}><Send data-icon="inline-start" aria-hidden="true" /> Seçilen hesaplara kuyruğa al</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Draft listesi</CardTitle>
              <CardDescription>Hesap varyantları ve kalite kapıları burada kalır.</CardDescription>
            </div>
            <Button size="icon" variant="outline" onClick={() => setForm(asForm())} aria-label="Yeni draft"><Plus aria-hidden="true" /></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {drafts.length === 0 && (
              <Empty className="border border-dashed py-8">
                <EmptyHeader><EmptyTitle>Henüz draft yok</EmptyTitle><EmptyDescription>Yukarıdan bir brief ya da hazır metinle başla.</EmptyDescription></EmptyHeader>
                <EmptyContent><Button variant="outline" onClick={() => setForm(asForm())}><Plus data-icon="inline-start" aria-hidden="true" /> Yeni draft</Button></EmptyContent>
              </Empty>
            )}
            {drafts.map((draft) => {
              const selected = form.id === draft.id;
              return (
                <Button key={draft.id} type="button" variant={selected ? "secondary" : "ghost"} className="h-auto min-h-28 flex-col items-stretch gap-2 border border-transparent p-3 text-left" data-selected={selected} onClick={() => setForm(asForm(draft))}>
                  <span className="flex items-center justify-between gap-2"><Badge variant="outline">{draft.format}</Badge><Badge variant={draft.status === "ready" ? "default" : draft.status === "blocked" ? "destructive" : "secondary"}>{draft.status}</Badge></span>
                  <span className="line-clamp-3 text-sm font-normal">{draft.text}</span>
                  <span className="text-xs font-normal text-muted-foreground">@{draft.accountHandle} · {draft.origin || "manual"}{draft.batchId ? ` · ${draft.batchId.slice(0, 12)}` : ""}</span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Draft editörü</CardTitle><CardDescription>Tek draft üzerinde metin, hesap ve gate sonucunu düzelt.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="draft-account">Yayın hesabı</FieldLabel><Select value={form.accountId ? String(form.accountId) : null} onValueChange={(value) => update("accountId", value ? Number(value) : null)}><SelectTrigger id="draft-account" className="w-full"><SelectValue placeholder="Hesap seç" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>)}</SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="draft-score">Market skoru</FieldLabel><Input id="draft-score" value={form.score || "—"} readOnly /></Field>
                <Field><FieldLabel htmlFor="draft-source">Kaynak external id</FieldLabel><Input id="draft-source" value={form.externalId} onChange={(event) => update("externalId", event.target.value)} placeholder="Market post id" /></Field>
                <Field><FieldLabel htmlFor="draft-url">Kaynak URL</FieldLabel><Input id="draft-url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://..." /></Field>
              </div>
            </FieldGroup>
            <Field><FieldLabel htmlFor="draft-text">İçerik</FieldLabel><Textarea id="draft-text" className="min-h-52" value={form.text} onChange={(event) => update("text", event.target.value)} placeholder="Özgün taslak metni..." /><FieldDescription className="text-right">{form.text.length}/280 karakter</FieldDescription></Field>
            {form.sourceUrl && <a href={form.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">Kaynak postunu aç</a>}
            {form.gateReason && <Alert variant={form.status === "blocked" ? "destructive" : "default"}><AlertDescription>Gate: {form.gateReason}</AlertDescription></Alert>}
            {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} Kaydet</Button>
              <Button variant="outline" onClick={generateFromMarket} disabled={pending}><Sparkles data-icon="inline-start" aria-hidden="true" /> Market varyantı</Button>
              <Button variant="secondary" onClick={queue} disabled={pending}><Send data-icon="inline-start" aria-hidden="true" /> Kuyruğa al</Button>
              <Button variant="destructive" onClick={removeDraft} disabled={pending || !form.id}><Trash2 data-icon="inline-start" aria-hidden="true" /> Sil</Button>
              <Badge variant="outline" className="gap-2"><Inbox aria-hidden="true" /> {form.status}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
