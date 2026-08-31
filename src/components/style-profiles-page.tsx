"use client";

import { useState } from "react";
import type { Account, WritingStyleSettings } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAbortableRequest } from "@/components/use-abortable-request";

type ExampleStyle = { tone?: string; ideology?: string; opening?: string; emoji?: string; formatRule?: string; editorialInstruction?: string; writingSkillIds?: string[] };
type IdeologyOption = { id: string; name: { en: string; tr: string } };

function profileJson(profile?: Record<string, unknown>): string {
  const advancedProfile = { ...(profile || {}) };
  delete advancedProfile.editorialInstruction;
  return JSON.stringify(advancedProfile, null, 2);
}

function profileInstruction(profile?: Record<string, unknown>): string {
  return typeof profile?.editorialInstruction === "string" ? profile.editorialInstruction : "";
}

export function StyleProfilesPage({ initial, initialSettings, ideologies }: { initial: Account[]; initialSettings: WritingStyleSettings; ideologies: IdeologyOption[] }) {
  const [accounts, setAccounts] = useState(initial);
  const [selected, setSelected] = useState(initial[0]?.id || 0);
  const current = accounts.find((account) => account.id === selected);
  const [text, setText] = useState(() => profileJson(initial[0]?.styleProfile));
  const [accountInstruction, setAccountInstruction] = useState(() => profileInstruction(initial[0]?.styleProfile));
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"account" | "settings" | "">("");
  const { pending, run, abort } = useAbortableRequest();
  const example = settings.exampleStyle as ExampleStyle;

  function choose(id: number) {
    const account = accounts.find((item) => item.id === id);
    setSelected(id); setText(profileJson(account?.styleProfile)); setAccountInstruction(profileInstruction(account?.styleProfile)); setMessage("");
  }

  async function saveAccount() {
    if (!current) return;
    let styleProfile: Record<string, unknown>;
    try { styleProfile = JSON.parse(text) as Record<string, unknown>; } catch { setMessage("Geçerli JSON gerekli."); return; }
    const instruction = accountInstruction.trim();
    if (instruction.length > 6000) { setMessage("Hesap yönergesi en fazla 6000 karakter olabilir."); return; }
    if (instruction) styleProfile.editorialInstruction = instruction;
    else delete styleProfile.editorialInstruction;
    setPendingAction("account");
    const response = await run((signal) => fetch(`/api/accounts/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styleProfile }), signal }));
    if (!response) { setPendingAction(""); setMessage("İstek durduruldu; kaydetme sunucuda tamamlanmış olabilir, sayfayı yenileyerek kontrol et."); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction(""); setMessage(response.ok ? "Hesap stili kaydedildi." : body.error || "Kaydedilemedi.");
    if (response.ok) setAccounts((items) => items.map((item) => item.id === current.id ? body : item));
  }

  async function saveSettings() {
    setPendingAction("settings");
    const response = await run((signal) => fetch("/api/settings/style", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings), signal }));
    if (!response) { setPendingAction(""); setMessage("İstek durduruldu; kaydetme sunucuda tamamlanmış olabilir, sayfayı yenileyerek kontrol et."); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction(""); setMessage(response.ok ? "Örnek post stili ve writing skill’leri kaydedildi." : body.error || "Kaydedilemedi.");
    if (response.ok) setSettings(body);
  }

  function updateExample(key: keyof ExampleStyle, value: string) { setSettings((current) => ({ ...current, exampleStyle: { ...current.exampleStyle, [key]: value } })); }
  function setExampleSkill(id: string, enabled: boolean) { const ids = new Set(example.writingSkillIds || settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id)); enabled ? ids.add(id) : ids.delete(id); setSettings((current) => ({ ...current, exampleStyle: { ...current.exampleStyle, writingSkillIds: [...ids] } })); }
  function updateSkill(id: string, patch: Record<string, unknown>) { setSettings((current) => ({ ...current, skills: current.skills.map((skill) => skill.id === id ? { ...skill, ...patch } : skill) })); }
  function resetSkill(id: string) { setSettings((current) => ({ ...current, skills: current.skills.map((skill) => skill.id === id ? initialSettings.skills.find((item) => item.id === id)! : skill) })); }
  function setAccountSkill(id: string, enabled: boolean) { try { const profile = JSON.parse(text) as Record<string, unknown>; const ids = new Set(Array.isArray(profile.writingSkillIds) ? profile.writingSkillIds.map(String) : settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id)); enabled ? ids.add(id) : ids.delete(id); setText(JSON.stringify({ ...profile, writingSkillIds: [...ids] }, null, 2)); } catch { setMessage("Önce geçerli hesap JSON'u gerekli."); } }
  const accountSkillIds = (() => { try { const profile = JSON.parse(text) as Record<string, unknown>; return new Set(Array.isArray(profile.writingSkillIds) ? profile.writingSkillIds.map(String) : settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id)); } catch { return new Set<string>(); } })();

  return <div className="flex flex-col gap-5">
    {pending ? <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>İstek sürüyor. Durdurmak sunucuda tamamlanmış bir kaydetmeyi geri almaz.</span><Button type="button" variant="destructive" size="sm" onClick={abort}>Durdur</Button></AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>Örnek post stili</CardTitle><CardDescription>Hesap seçmeden oluşturulan örnek postların ayrı ses ve tandans profili.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <Field><FieldLabel htmlFor="example-tone">Ton</FieldLabel><Input id="example-tone" value={example.tone || ""} onChange={(event) => updateExample("tone", event.target.value)} disabled={pending} /></Field>
      <Field><FieldLabel>Editoryal eksen / tandans</FieldLabel><Select value={example.ideology || "belirsiz"} onValueChange={(value) => updateExample("ideology", value || "belirsiz")} disabled={pending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="belirsiz">Belirsiz / nötr</SelectItem>{ideologies.map((item) => <SelectItem key={item.id} value={item.id}>{item.name.tr || item.name.en}</SelectItem>)}</SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="example-opening">Açılış</FieldLabel><Input id="example-opening" value={example.opening || ""} onChange={(event) => updateExample("opening", event.target.value)} disabled={pending} /></Field>
      <Field><FieldLabel htmlFor="example-emoji">Emoji</FieldLabel><Input id="example-emoji" value={example.emoji || ""} onChange={(event) => updateExample("emoji", event.target.value)} disabled={pending} /></Field>
      <Field className="md:col-span-2"><FieldLabel htmlFor="example-format">Format kuralı</FieldLabel><Input id="example-format" value={example.formatRule || ""} onChange={(event) => updateExample("formatRule", event.target.value)} disabled={pending} /><FieldDescription>Yalnız kaynak postu açık özel-haber etiketi taşıyorsa görünen kaynak adı eklenir.</FieldDescription></Field>
      <Field className="md:col-span-2"><FieldLabel htmlFor="example-editorial-instruction">Global auto-hitmaker yönergesi</FieldLabel><Textarea id="example-editorial-instruction" value={example.editorialInstruction || ""} onChange={(event) => updateExample("editorialInstruction", event.target.value)} disabled={pending} className="min-h-36" /><FieldDescription>Tüm üretimlerin temel editoryal sesi. Kaynak güvenliği, özgünlük, karakter limiti ve yayın kapıları bu metinle değiştirilemez.</FieldDescription></Field>
      <Field className="md:col-span-2"><FieldLabel>Bu örnek postta etkin skill’ler</FieldLabel><div className="flex flex-wrap gap-3">{settings.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(example.writingSkillIds || settings.skills.filter((item) => item.enabled).map((item) => item.id)).includes(skill.id)} onChange={(event) => setExampleSkill(skill.id, event.target.checked)} disabled={pending || !skill.enabled} /> {skill.name}</label>)}</div></Field>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Yazım skill’leri</CardTitle><CardDescription>Skills.sh kaynakları incelenmiş yerel metin kurallarıdır; uygulama dışarıdan skill, script veya MCP çalıştırmaz.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      {settings.skills.map((skill) => <div key={skill.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-medium">{skill.name}</h3><Badge variant={skill.enabled ? "default" : "outline"}>{skill.enabled ? "etkin" : "kapalı"}</Badge></div><a className="mt-1 block text-xs text-muted-foreground hover:underline" href={skill.sourceUrl} target="_blank" rel="noreferrer">{skill.sourceUrl}</a><p className="mt-1 text-xs text-muted-foreground">{skill.reviewedRevision}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skill.enabled} onChange={(event) => updateSkill(skill.id, { enabled: event.target.checked })} disabled={pending} /> etkin</label></div><Field className="mt-4"><FieldLabel htmlFor={`skill-${skill.id}`}>Yerel yönerge</FieldLabel><Textarea id={`skill-${skill.id}`} value={skill.instructions} onChange={(event) => updateSkill(skill.id, { instructions: event.target.value })} disabled={pending} className="min-h-28" /></Field><Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => resetSkill(skill.id)} disabled={pending}>İncelenmiş varsayılana dön</Button></div>)}
      <Button onClick={saveSettings} disabled={pending}>{pendingAction === "settings" ? <Spinner data-icon="inline-start" /> : null} Örnek stil ve skill’leri kaydet</Button>
    </CardContent></Card>

    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle>Hesaplar</CardTitle><CardDescription>Hesap stili örnek post stilinden bağımsızdır.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{accounts.length === 0 ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Hesap yok</EmptyTitle><EmptyDescription>Stil profili oluşturmak için önce bir hesap ekle.</EmptyDescription></EmptyHeader></Empty> : accounts.map((account) => <Button type="button" key={account.id} variant={selected === account.id ? "secondary" : "ghost"} className="h-auto justify-start border border-transparent p-3 text-left" data-selected={selected === account.id} onClick={() => choose(account.id)}>@{account.handle}</Button>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>{current ? `@${current.handle} stil profili` : "Stil profili"}</CardTitle><CardDescription>Bu hesabın tandansı, tonu, yönergesi ve skill seçimi yalnız kendi üretimine gider.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel>Bu hesapta etkin skill’ler</FieldLabel><div className="flex flex-wrap gap-3">{settings.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountSkillIds.has(skill.id)} onChange={(event) => setAccountSkill(skill.id, event.target.checked)} disabled={!current || pending || !skill.enabled} /> {skill.name}</label>)}</div></Field><Field><FieldLabel htmlFor="account-editorial-instruction">Hesaba özel yönerge</FieldLabel><Textarea id="account-editorial-instruction" value={accountInstruction} onChange={(event) => setAccountInstruction(event.target.value)} disabled={!current || pending} className="min-h-36" /><FieldDescription>Global yönergeye eklenir; boş bırakırsan yalnız global yönerge kullanılır. Bu alan gelişmiş JSON içindeki aynı değerin yerine geçer.</FieldDescription></Field><Field><FieldLabel htmlFor="style-profile">Gelişmiş profil JSON</FieldLabel><Textarea id="style-profile" className="min-h-72 font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} disabled={!current || pending} aria-invalid={message === "Geçerli JSON gerekli."} /></Field><Button onClick={saveAccount} disabled={!current || pending}>{pendingAction === "account" ? <Spinner data-icon="inline-start" /> : null} Hesap stilini kaydet</Button></CardContent></Card>
    </div>
    {message && <Alert variant={message === "Geçerli JSON gerekli." ? "destructive" : "default"}><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
