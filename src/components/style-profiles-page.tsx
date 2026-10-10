"use client";

import { useState } from "react";
import type { Account, WritingStyleSettings } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAbortableRequest } from "@/components/use-abortable-request";
import { diffStyleProfiles, parseStyleProfileJson, STYLE_PROFILE_SCHEMA_VERSION } from "@/components/style-profile-json";
import { LOCALES, LOCALE_CONFIG } from "@/i18n/config";

type ExampleStyle = { tone?: string; opening?: string; emoji?: string; formatRule?: string; editorialInstruction?: string; writingSkillIds?: string[] };

function profileJson(profile?: Record<string, unknown>): string {
  const advancedProfile = { ...(profile || {}) };
  delete advancedProfile.editorialInstruction;
  delete advancedProfile.ideology;
  return JSON.stringify(advancedProfile, null, 2);
}

function profileInstruction(profile?: Record<string, unknown>): string {
  return typeof profile?.editorialInstruction === "string" ? profile.editorialInstruction : "";
}

function profileText(profile: Record<string, unknown>, key: string): string {
  return typeof profile[key] === "string" ? profile[key] as string : "";
}

function withoutInstruction(profile?: Record<string, unknown>): Record<string, unknown> {
  const result = { ...(profile || {}) };
  delete result.editorialInstruction;
  delete result.ideology;
  return result;
}

function diffValue(value: unknown): string {
  if (value === undefined) return "(yok)";
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 180 ? `${rendered.slice(0, 177)}…` : rendered;
}

export function StyleProfilesPage({ initial, initialSettings }: { initial: Account[]; initialSettings: WritingStyleSettings }) {
  const [accounts, setAccounts] = useState(initial);
  const [selected, setSelected] = useState(initial[0]?.id || 0);
  const current = accounts.find((account) => account.id === selected);
  const [profile, setProfile] = useState<Record<string, unknown>>(() => ({ ...(initial[0]?.styleProfile || {}) }));
  const [advancedText, setAdvancedText] = useState(() => profileJson(initial[0]?.styleProfile));
  const [advancedError, setAdvancedError] = useState("");
  const [advancedUndoProfile, setAdvancedUndoProfile] = useState<Record<string, unknown>>(() => withoutInstruction(initial[0]?.styleProfile));
  const [advancedEdited, setAdvancedEdited] = useState(false);
  const [accountInstruction, setAccountInstruction] = useState(() => profileInstruction(initial[0]?.styleProfile));
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"account" | "settings" | "">("");
  const { pending, run, abort } = useAbortableRequest();
  const example = settings.exampleStyle as ExampleStyle;

  function choose(id: number) {
    const account = accounts.find((item) => item.id === id);
    setSelected(id);
    setProfile({ ...(account?.styleProfile || {}) });
    setAdvancedText(profileJson(account?.styleProfile));
    setAdvancedError("");
    setAdvancedUndoProfile(withoutInstruction(account?.styleProfile));
    setAdvancedEdited(false);
    setAccountInstruction(profileInstruction(account?.styleProfile));
    setMessage("");
  }

  function updateProfile(key: string, value: string) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    setAdvancedText(profileJson(next));
    setAdvancedError("");
    setAdvancedUndoProfile(withoutInstruction(next));
    setAdvancedEdited(false);
  }

  function updatePreferredLocales(values: string[]) {
    const next = { ...profile, preferredLocales: values };
    setProfile(next);
    setAdvancedText(profileJson(next));
    setAdvancedError("");
    setAdvancedUndoProfile(withoutInstruction(next));
    setAdvancedEdited(false);
  }

  async function saveAccount() {
    if (!current) return;
    const styleProfile = { ...profile };
    const instruction = accountInstruction.trim();
    if (instruction.length > 6000) { setMessage("Hesap yönergesi en fazla 6000 karakter olabilir."); return; }
    if (instruction) styleProfile.editorialInstruction = instruction;
    else delete styleProfile.editorialInstruction;
    setPendingAction("account");
    const response = await run((signal) => fetch(`/api/accounts/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styleProfile }), signal }));
    if (!response) { setPendingAction(""); setMessage("İstek durduruldu; kaydetme sunucuda tamamlanmış olabilir, sayfayı yenileyerek kontrol et."); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction(""); setMessage(response.ok ? (advancedError ? "Hesap tercihleri kaydedildi; geçersiz JSON taslağı kaydedilmedi." : "Hesap tercihleri kaydedildi.") : body.error || "Kaydedilemedi.");
    if (response.ok) {
      setAccounts((items) => items.map((item) => item.id === current.id ? body : item));
      setProfile({ ...(body.styleProfile || {}) });
      setAdvancedText(profileJson(body.styleProfile));
      setAdvancedError("");
      setAdvancedUndoProfile(withoutInstruction(body.styleProfile));
      setAdvancedEdited(false);
      setAccountInstruction(profileInstruction(body.styleProfile));
    }
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
  function setExampleSkill(id: string, enabled: boolean) { const ids = new Set(example.writingSkillIds || settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id)); if (enabled) ids.add(id); else ids.delete(id); setSettings((current) => ({ ...current, exampleStyle: { ...current.exampleStyle, writingSkillIds: [...ids] } })); }
  function updateSkill(id: string, patch: Record<string, unknown>) { setSettings((current) => ({ ...current, skills: current.skills.map((skill) => skill.id === id ? { ...skill, ...patch } : skill) })); }
  function resetSkill(id: string) { setSettings((current) => ({ ...current, skills: current.skills.map((skill) => skill.id === id ? initialSettings.skills.find((item) => item.id === id)! : skill) })); }
  function setAccountSkill(id: string, enabled: boolean) {
    const ids = new Set(Array.isArray(profile.writingSkillIds) ? profile.writingSkillIds.map(String) : settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id));
    if (enabled) ids.add(id);
    else ids.delete(id);
    const next = { ...profile, writingSkillIds: [...ids] };
    setProfile(next);
    setAdvancedText(profileJson(next));
    setAdvancedError("");
  }
  const accountSkillIds = new Set(Array.isArray(profile.writingSkillIds) ? profile.writingSkillIds.map(String) : settings.skills.filter((skill) => skill.enabled).map((skill) => skill.id));

  function discardAccountChanges() {
    const saved = current?.styleProfile || {};
    setProfile({ ...saved });
    setAdvancedText(profileJson(saved));
    setAdvancedError("");
    setAdvancedUndoProfile(withoutInstruction(saved));
    setAdvancedEdited(false);
    setAccountInstruction(profileInstruction(saved));
    setMessage("Kaydedilmiş hesap ayarları geri yüklendi.");
  }

  function updateAdvancedProfile(value: string) {
    if (!advancedEdited) setAdvancedUndoProfile(withoutInstruction(profile));
    setAdvancedEdited(true);
    setAdvancedText(value);
    try {
      const parsed = parseStyleProfileJson(value);
      if (Object.hasOwn(current?.styleProfile || {}, "ideology")) parsed.ideology = current!.styleProfile.ideology;
      else delete parsed.ideology;
      setProfile(parsed);
      setAdvancedError("");
    } catch {
      setAdvancedError("JSON şeması geçersiz. Bu taslak kaydedilmez; diğer geçerli tercihler kaydedilebilir.");
    }
  }

  function undoAdvancedProfile() {
    setProfile(advancedUndoProfile);
    setAdvancedText(JSON.stringify(advancedUndoProfile, null, 2));
    setAdvancedError("");
    setAdvancedEdited(false);
    setMessage("Gelişmiş profil düzenlemesi geri alındı.");
  }

  const advancedChanges = diffStyleProfiles(withoutInstruction(current?.styleProfile), withoutInstruction(profile));

  return <div className="flex flex-col gap-5">
    {pending ? <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>İstek sürüyor. Durdurmak sunucuda tamamlanmış bir kaydetmeyi geri almaz.</span><Button type="button" variant="destructive" size="sm" onClick={abort}>Durdur</Button></AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>Örnek post stili</CardTitle><CardDescription>Hesap seçmeden oluşturulan örnek postların ortak yazım profili.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <Field><FieldLabel htmlFor="example-tone">Ton</FieldLabel><Input id="example-tone" value={example.tone || ""} onChange={(event) => updateExample("tone", event.target.value)} disabled={pending} /></Field>
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
      <Card><CardHeader><CardTitle>{current ? `@${current.handle} içerik tercihleri` : "İçerik tercihleri"}</CardTitle><CardDescription>Bu hesabın tercihleri yalnız kendi üretimine uygulanır. Yayın onayı ve güvenlik kuralları bu ayarlardan değişmez.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="account-niche">Konular</FieldLabel><Input id="account-niche" value={profileText(profile, "niche")} onChange={(event) => updateProfile("niche", event.target.value)} disabled={!current || pending} maxLength={500} placeholder="Örn. yapay zekâ ve açık kaynak" /><FieldDescription>Fırsatların bu hesapla eşleşmesini açıklamaya yardımcı olur.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-tone">Yazım tonu</FieldLabel><Input id="account-tone" value={profileText(profile, "tone")} onChange={(event) => updateProfile("tone", event.target.value)} disabled={!current || pending} maxLength={500} placeholder="Örn. sade ve doğrudan" /></Field>
          <Field><FieldLabel htmlFor="account-content-locale">Taslak dili</FieldLabel><select id="account-content-locale" className="h-10 rounded-md border bg-background px-3 text-sm" value={(LOCALES as readonly string[]).includes(profileText(profile, "contentLocale")) ? profileText(profile, "contentLocale") : ""} onChange={(event) => updateProfile("contentLocale", event.target.value)} disabled={!current || pending}><option value="">Otomatik · hesap sinyaline göre</option>{LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_CONFIG[locale].nativeName}</option>)}</select><FieldDescription>Arayüz dilinden ayrıdır; seçiliyse üretilen taslakların dilini belirler.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-preferred-locales">Tercih edilen diller</FieldLabel><select id="account-preferred-locales" multiple size={5} className="rounded-md border bg-background px-3 py-2 text-sm" value={Array.isArray(profile.preferredLocales) ? profile.preferredLocales.filter((item): item is string => typeof item === "string" && (LOCALES as readonly string[]).includes(item)) : []} onChange={(event) => updatePreferredLocales(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} disabled={!current || pending}>{LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_CONFIG[locale].nativeName}</option>)}</select><FieldDescription>İçerik dili otomatikse seçtiğin dillerden ilki kullanılır. Birden çok seçebilirsin.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-opening">Açılış tercihi</FieldLabel><Input id="account-opening" value={profileText(profile, "opening")} onChange={(event) => updateProfile("opening", event.target.value)} disabled={!current || pending} maxLength={500} placeholder="Örn. ana bilgiyle başla" /></Field>
          <Field><FieldLabel htmlFor="account-emoji">Emoji kullanımı</FieldLabel><Input id="account-emoji" value={profileText(profile, "emoji")} onChange={(event) => updateProfile("emoji", event.target.value)} disabled={!current || pending} maxLength={200} placeholder="Örn. kullanma" /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="account-format-rule">İçerik biçimi</FieldLabel><Input id="account-format-rule" value={profileText(profile, "formatRule")} onChange={(event) => updateProfile("formatRule", event.target.value)} disabled={!current || pending} maxLength={500} placeholder="Örn. tek paragraf, kısa cümle" /></Field>
        </div>
        <Field><FieldLabel>Bu hesapta etkin yazım kuralları</FieldLabel><div className="flex flex-wrap gap-3">{settings.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accountSkillIds.has(skill.id)} onChange={(event) => setAccountSkill(skill.id, event.target.checked)} disabled={!current || pending || !skill.enabled} /> {skill.name}</label>)}</div><FieldDescription>Yalnız genel ayarlarda etkin olan kurallar seçilebilir.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="account-editorial-instruction">Hesaba özel ek yönerge</FieldLabel><Textarea id="account-editorial-instruction" value={accountInstruction} onChange={(event) => setAccountInstruction(event.target.value)} disabled={!current || pending} className="min-h-28" maxLength={6000} /><FieldDescription>Genel yönergeye eklenir; boş bırakırsan yalnız genel yönerge kullanılır.</FieldDescription></Field>
        <details key={selected} className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Gelişmiş profil alanları · JSON · Şema v{STYLE_PROFILE_SCHEMA_VERSION}</summary>
          <p className="mt-2 text-sm text-muted-foreground">Yalnız hesap profilinin desteklenen alanları kabul edilir. Hesap yönlendirme ve kendi postlarından türetilen ses profili gibi alanlar burada görüntülenebilir. Yayın güvenliği veya onay kuralları bu JSON ile değiştirilemez.</p>
          <Textarea id="style-profile" className="mt-3 min-h-72 font-mono text-xs" value={advancedText} onChange={(event) => updateAdvancedProfile(event.target.value)} disabled={!current || pending} aria-invalid={Boolean(advancedError)} />
          {advancedError && <p className="mt-2 text-sm text-destructive" role="alert">{advancedError}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{advancedChanges.length ? `${advancedChanges.length} profil alanında kaydedilmemiş değişiklik.` : "Gelişmiş alanlarda değişiklik yok."}</p>
            <Button type="button" variant="outline" size="sm" onClick={undoAdvancedProfile} disabled={!current || pending || !advancedEdited}>Gelişmiş düzenlemeyi geri al</Button>
          </div>
          {advancedChanges.length > 0 && <ul className="mt-3 grid gap-2 text-xs" aria-label="Gelişmiş profil değişiklikleri">{advancedChanges.map((change) => <li key={change.key} className="rounded border p-2"><strong>{change.key}</strong><div className="mt-1 grid gap-1 sm:grid-cols-2"><span className="break-words text-muted-foreground">Önce: {diffValue(change.before)}</span><span className="break-words">Sonra: {diffValue(change.after)}</span></div></li>)}</ul>}
        </details>
        <div className="flex flex-wrap gap-2"><Button onClick={saveAccount} disabled={!current || pending}>{pendingAction === "account" ? <Spinner data-icon="inline-start" /> : null} Tercihleri kaydet</Button><Button type="button" variant="outline" onClick={discardAccountChanges} disabled={!current || pending}>Kaydedileni geri yükle</Button></div>
      </CardContent></Card>
    </div>
    {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
