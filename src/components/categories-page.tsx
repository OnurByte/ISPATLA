"use client";

import { useState } from "react";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { Account, CategoryDefinition } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Draft = Omit<CategoryDefinition, "id" | "createdAt" | "updatedAt"> & { id?: number };
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const blank = (): Draft => ({ slug: "", name: "", enabled: true, builtIn: false, baseStrategy: "generic", clusterStrategy: "topic", verificationMode: "moderate", description: "", positiveExamples: [], negativeExamples: [], keywords: [], excludedKeywords: [], seedHandles: [], defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: "" });
const draftFor = (item: CategoryDefinition): Draft => ({ ...item });
const baseLabels: Record<string, string> = { generic: "Genel içerik", news: "Haber", politics: "Siyaset", technology: "Teknoloji", finance: "Finans", sports: "Spor", entertainment: "Eğlence", meme: "Mizah", shitpost: "Serbest mizah" };
const clusterLabels: Record<string, string> = { event: "Gelişme", topic: "Konu", meme: "Mizah", conversation: "Sohbet", format: "Biçim", hybrid: "Karma" };
const verificationLabels: Record<string, string> = { strict: "Yüksek", moderate: "Dengeli", minimal: "Temel", none: "Kapalı" };

export function CategoriesPage({ initial, accounts }: { initial: CategoryDefinition[]; accounts: Pick<Account, "id" | "handle" | "displayName">[] }) {
  const [items, setItems] = useState(initial);
  const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
  const [draft, setDraft] = useState<Draft>(blank());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const editing = Boolean(draft.id);
  const start = (item?: CategoryDefinition) => {
    const next = item ? draftFor(item) : blank();
    setDraft(next);
    setMessage("");
  };
  async function save() {
    setPending(true); setMessage("");
    try {
      const body = { ...draft, accountId };
      const response = await fetch(editing ? `/api/categories/${draft.id}` : "/api/categories", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Kategori kaydedilemedi.");
      const next = await fetch(`/api/categories?accountId=${accountId}`, { cache: "no-store" }).then((item) => item.json() as Promise<CategoryDefinition[]>);
      setItems(next); start(); setMessage("Kategori kaydedildi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Kategori kaydedilemedi."); } finally { setPending(false); }
  }
  async function remove(item: CategoryDefinition) {
    if (!window.confirm(`${item.name} kategorisini silmek istiyor musun?`)) return;
    setPending(true); const response = await fetch(`/api/categories/${item.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) }); const result = await response.json().catch(() => ({})); setPending(false);
    if (!response.ok) return setMessage(result.error || "Kategori silinemedi.");
    setItems((current) => current.filter((candidate) => candidate.id !== item.id)); if (draft.id === item.id) start(); setMessage("Kategori silindi.");
  }
  const changeList = (key: "positiveExamples" | "negativeExamples" | "keywords" | "excludedKeywords" | "seedHandles" | "defaultFormats", value: string) => setDraft({ ...draft, [key]: list(value) });
  const updatePolicy = (key: "sourcePolicy" | "riskPolicy" | "scoringPolicy" | "publishingPolicy", name: string, value: unknown) => setDraft({ ...draft, [key]: { ...draft[key], [name]: value } });
  async function selectAccount(nextAccountId: number) {
    setAccountId(nextAccountId); start();
    if (!nextAccountId) { setItems([]); return; }
    setPending(true);
    try { const response = await fetch(`/api/categories?accountId=${nextAccountId}`, { cache: "no-store" }); if (!response.ok) throw new Error("Hesabın kategorileri alınamadı."); setItems(await response.json() as CategoryDefinition[]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Hesabın kategorileri alınamadı."); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-5">
    <Card><CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4"><div><CardTitle>Kategoriler</CardTitle><CardDescription>Hazır kategoriler ortak katalogdur. Özel kategorilerin ve kaynakların seçili hesaba aittir.</CardDescription></div><Field className="min-w-56"><FieldLabel htmlFor="category-account">Hesap</FieldLabel><Select value={accountId ? String(accountId) : "none"} onValueChange={(value) => { void selectAccount(value === "none" ? 0 : Number(value)); }}><SelectTrigger id="category-account"><SelectValue /></SelectTrigger><SelectContent>{accounts.length ? accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>) : <SelectItem value="none">Bağlı hesap yok</SelectItem>}</SelectContent></Select></Field></CardHeader><CardContent className="flex flex-col gap-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.description || `${baseLabels[item.baseStrategy] || "Genel içerik"} · ${clusterLabels[item.clusterStrategy] || "Karma"}`}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant={item.builtIn ? "secondary" : "outline"}>{item.builtIn ? "Hazır · salt okunur" : "Bu hesaba özel"}</Badge>{!item.builtIn && <><Button size="icon" variant="ghost" disabled={pending} onClick={() => start(item)} aria-label={`${item.name} düzenle`}><Pencil aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={pending} onClick={() => remove(item)} aria-label={`${item.name} sil`}><Trash2 aria-hidden="true" /></Button></>}</div></div>)}{!items.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Bu hesapta henüz kategori yok.</p>}<Button className="self-start" variant="outline" onClick={() => start()} disabled={pending || !accountId}><Plus data-icon="inline-start" aria-hidden="true" /> Yeni özel kategori</Button></CardContent></Card>
    {accountId ? <Card><CardHeader><CardTitle>{editing ? `${draft.name || "Kategori"} düzenle` : "Yeni kategori"}</CardTitle><CardDescription>Konu, örnek ve yazım tercihlerini düzenle. Değişiklikler yalnız seçili hesaba uygulanır.</CardDescription></CardHeader><CardContent><FieldGroup>
      <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="category-name">Kategori adı</FieldLabel><Input id="category-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field><Field><FieldLabel htmlFor="category-slug">Kısa adres</FieldLabel><Input id="category-slug" value={draft.slug} disabled={editing && draft.builtIn} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="ornek: monero" /></Field></div>
      <Field><FieldLabel htmlFor="category-description">Kısa açıklama</FieldLabel><Input id="category-description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Bu kategori hangi konuları kapsar?" /></Field>
      <Field><FieldLabel htmlFor="category-verification">Kaynak doğrulama düzeyi</FieldLabel><Select value={draft.verificationMode} onValueChange={(value) => setDraft({ ...draft, verificationMode: value as Draft["verificationMode"] })}><SelectTrigger id="category-verification"><SelectValue /></SelectTrigger><SelectContent>{["strict", "moderate", "minimal", "none"].map((value) => <SelectItem key={value} value={value}>{verificationLabels[value]}</SelectItem>)}</SelectContent></Select></Field>
      <div className="grid gap-3 sm:grid-cols-2">{([ ["keywords", "Konu anahtar kelimeleri"], ["excludedKeywords", "Hariç tutulacak kelimeler"], ["seedHandles", "Örnek 𝕏 hesapları"], ["positiveExamples", "İyi içerik örnekleri"], ["negativeExamples", "Kaçınılacak içerik örnekleri"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`category-${key}`}>{label}</FieldLabel><Input id={`category-${key}`} value={draft[key].join(", ")} onChange={(e) => changeList(key, e.target.value)} placeholder="Virgülle ayır" /></Field>)}</div>
      <Field><FieldLabel htmlFor="category-ai-context">Yazım yönergesi</FieldLabel><Textarea id="category-ai-context" value={draft.aiContext} onChange={(e) => setDraft({ ...draft, aiContext: e.target.value })} placeholder="Bu konuda içerik üretirken izlenecek tonu ve kuralları yaz." /></Field>
      <details className="rounded-md border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Gelişmiş kategori ayarları</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="category-base">İçerik yaklaşımı</FieldLabel><Select value={draft.baseStrategy} onValueChange={(value) => setDraft({ ...draft, baseStrategy: value as Draft["baseStrategy"] })}><SelectTrigger id="category-base"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(baseLabels).map((value) => <SelectItem key={value} value={value}>{baseLabels[value]}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="category-cluster">Benzer gönderileri gruplama</FieldLabel><Select value={draft.clusterStrategy} onValueChange={(value) => setDraft({ ...draft, clusterStrategy: value as Draft["clusterStrategy"] })}><SelectTrigger id="category-cluster"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(clusterLabels).map((value) => <SelectItem key={value} value={value}>{clusterLabels[value]}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="category-formats">İçerik biçimleri</FieldLabel><Input id="category-formats" value={draft.defaultFormats.join(", ")} onChange={(e) => changeList("defaultFormats", e.target.value)} placeholder="post, thread, reply" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.sourcePolicy.requireAttribution === true} onChange={(event) => updatePolicy("sourcePolicy", "requireAttribution", event.target.checked)} /> İçerikte kaynağı belirt</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.publishingPolicy.paused === true} onChange={(event) => updatePolicy("publishingPolicy", "paused", event.target.checked)} /> Bu kategoride otomatik yayını duraklat</label>
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">İçerik risk kuralları</p><div className="grid gap-3 sm:grid-cols-2">{([ ["fabricatedFact", "Uydurma bilgi"], ["harassment", "Taciz ve hedef gösterme"], ["privateLife", "Özel hayat"], ["rumor", "Doğrulanmamış söylenti"], ["protectedTarget", "Hassas grupları hedefleme"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`risk-${key}`}>{label}</FieldLabel><Select value={String(draft.riskPolicy[key] || "allow")} onValueChange={(value) => updatePolicy("riskPolicy", key, value)}><SelectTrigger id={`risk-${key}`}><SelectValue /></SelectTrigger><SelectContent>{[["allow", "Ek kural yok"], ["avoid", "Kaçın"], ["block", "Engelle"]].map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select></Field>)}</div></div>
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">İçerik kalite tercihleri</p><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="score-novelty">Özgünlük</FieldLabel><Select value={String(draft.scoringPolicy.novelty || "balanced")} onValueChange={(value) => updatePolicy("scoringPolicy", "novelty", value)}><SelectTrigger id="score-novelty"><SelectValue /></SelectTrigger><SelectContent>{[["balanced", "Dengeli"], ["high", "Yüksek"], ["very_high", "Çok yüksek"]].map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel htmlFor="score-confirmation">Bilgi doğrulama</FieldLabel><Select value={String(draft.scoringPolicy.confirmation || "recommended")} onValueChange={(value) => updatePolicy("scoringPolicy", "confirmation", value)}><SelectTrigger id="score-confirmation"><SelectValue /></SelectTrigger><SelectContent>{[["recommended", "Önerilir"], ["required", "Zorunlu"], ["optional", "İsteğe bağlı"]].map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}</SelectContent></Select></Field></div></div>
      </div></details>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Etkin</label>
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}<div className="flex gap-2"><Button onClick={save} disabled={pending}><Save data-icon="inline-start" aria-hidden="true" /> Kaydet</Button><Button variant="outline" onClick={() => start()} disabled={pending}><Plus data-icon="inline-start" aria-hidden="true" /> Temizle</Button></div>
    </FieldGroup></CardContent></Card> : null}
  </div>;
}
