"use client";

import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
import type { Account, WritingStyleSettings } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  if (value === undefined) return "(none)";
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  return rendered.length > 180 ? `${rendered.slice(0, 177)}…` : rendered;
}

export function StyleProfilesPage({ initial, initialSettings }: { initial: Account[]; initialSettings: WritingStyleSettings }) {
  const { t, locale } = useUiText();
  const number = new Intl.NumberFormat(locale);
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
    if (instruction.length > 6000) { setMessage(t("Account instructions can be at most 6,000 characters.")); return; }
    if (instruction) styleProfile.editorialInstruction = instruction;
    else delete styleProfile.editorialInstruction;
    setPendingAction("account");
    const response = await run((signal) => fetch(`/api/accounts/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ styleProfile }), signal }));
    if (!response) { setPendingAction(""); setMessage(t("Request stopped. Saving may have completed on the server; refresh the page to check.")); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction(""); setMessage(response.ok ? (advancedError ? t("Account preferences saved. The invalid JSON draft was not saved.") : t("Account preferences saved.")) : t(body.error || "Could not save changes."));
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
    if (!response) { setPendingAction(""); setMessage(t("Request stopped. Saving may have completed on the server; refresh the page to check.")); return; }
    const body = await response.json().catch(() => ({}));
    setPendingAction(""); setMessage(response.ok ? t("Example post style and writing skills saved.") : t(body.error || "Could not save changes."));
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
    setMessage(t("Saved account settings restored."));
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
      setAdvancedError(t("The JSON schema is invalid. This draft will not be saved; other valid preferences can still be saved."));
    }
  }

  function undoAdvancedProfile() {
    setProfile(advancedUndoProfile);
    setAdvancedText(JSON.stringify(advancedUndoProfile, null, 2));
    setAdvancedError("");
    setAdvancedEdited(false);
    setMessage(t("Advanced profile edits undone."));
  }

  const voice = profile.voice && typeof profile.voice === "object" ? profile.voice as Record<string, unknown> : null;
  const voiceFeatures = voice?.features && typeof voice.features === "object" ? voice.features as Record<string, unknown> : null;
  const advancedChanges = diffStyleProfiles(withoutInstruction(current?.styleProfile), withoutInstruction(profile));

  return <div className="flex flex-col gap-5">
    {pending ? <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t("Request in progress. Stopping it will not undo a save that already completed on the server.")}</span><Button type="button" variant="destructive" size="sm" onClick={abort}>{t("Stop")}</Button></AlertDescription></Alert> : null}
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle>{t("Accounts")}</CardTitle><CardDescription>{t("Account style is independent from the example post style.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{accounts.length === 0 ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>{t("No accounts")}</EmptyTitle><EmptyDescription>{t("Add an account first to create a style profile.")}</EmptyDescription></EmptyHeader></Empty> : accounts.map((account) => <Button type="button" key={account.id} variant={selected === account.id ? "secondary" : "ghost"} className="h-auto justify-start border border-transparent p-3 text-start" data-selected={selected === account.id} onClick={() => choose(account.id)}>@{account.handle}</Button>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>{current ? t("Content preferences for @{handle}", { handle: current.handle }) : t("Content preferences")}</CardTitle><CardDescription>{t("This account’s preferences apply only to its own content. These settings do not change publishing approval or safety rules.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
        <Alert><AlertDescription>{voiceFeatures ? t("Writing analysis: {samples} usable posts ⁜ {average} characters on average. {source}", { samples: number.format(Number(voiceFeatures.usableSampleSize) || 0), average: number.format(Math.round(Number(voiceFeatures.avgChars) || 0)), source: t(profile.voiceSource === "inferred" ? "Inferred from the account’s own posts." : "Manually edited voice profile.") }) : t("No writing analysis yet. Run another analysis from the Accounts page.")}</AlertDescription></Alert>
        <details key={`preferences-${selected}`} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{t("Manual writing preferences")}</summary><div className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field><FieldLabel htmlFor="account-niche">{t("Topics")}</FieldLabel><Input id="account-niche" value={profileText(profile, "niche")} onChange={(event) => updateProfile("niche", event.target.value)} disabled={!current || pending} maxLength={500} placeholder={t("Example: AI and open source")} /><FieldDescription>{t("Helps explain how opportunities should match this account.")}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-tone">{t("Writing tone")}</FieldLabel><Input id="account-tone" value={profileText(profile, "tone")} onChange={(event) => updateProfile("tone", event.target.value)} disabled={!current || pending} maxLength={500} placeholder={t("Example: clear and direct")} /></Field>
          <Field><FieldLabel htmlFor="account-content-locale">{t("Draft language")}</FieldLabel><select id="account-content-locale" className="h-10 rounded-md border bg-background px-3 text-sm" value={(LOCALES as readonly string[]).includes(profileText(profile, "contentLocale")) ? profileText(profile, "contentLocale") : ""} onChange={(event) => updateProfile("contentLocale", event.target.value)} disabled={!current || pending}><option value="">{t("Automatic ⁜ based on account signals")}</option>{LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_CONFIG[locale].nativeName}</option>)}</select><FieldDescription>{t("Separate from the interface language. If selected, this sets the language of generated drafts.")}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-preferred-locales">{t("Preferred languages")}</FieldLabel><select id="account-preferred-locales" multiple size={5} className="rounded-md border bg-background px-3 py-2 text-sm" value={Array.isArray(profile.preferredLocales) ? profile.preferredLocales.filter((item): item is string => typeof item === "string" && (LOCALES as readonly string[]).includes(item)) : []} onChange={(event) => updatePreferredLocales(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} disabled={!current || pending}>{LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_CONFIG[locale].nativeName}</option>)}</select><FieldDescription>{t("When content language is automatic, the first selected language is used. You can select more than one.")}</FieldDescription></Field>
          <Field><FieldLabel htmlFor="account-opening">{t("Opening preference")}</FieldLabel><Input id="account-opening" value={profileText(profile, "opening")} onChange={(event) => updateProfile("opening", event.target.value)} disabled={!current || pending} maxLength={500} placeholder={t("Example: start with the key fact")} /></Field>
          <Field><FieldLabel htmlFor="account-emoji">{t("Emoji use")}</FieldLabel><Input id="account-emoji" value={profileText(profile, "emoji")} onChange={(event) => updateProfile("emoji", event.target.value)} disabled={!current || pending} maxLength={200} placeholder={t("Example: do not use")} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="account-format-rule">{t("Content format")}</FieldLabel><Input id="account-format-rule" value={profileText(profile, "formatRule")} onChange={(event) => updateProfile("formatRule", event.target.value)} disabled={!current || pending} maxLength={500} placeholder={t("Example: one paragraph, short sentences")} /></Field>
        </div>
        <Field><FieldLabel>{t("Writing skills enabled for this account")}</FieldLabel><div className="flex flex-wrap gap-3">{settings.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><Checkbox checked={accountSkillIds.has(skill.id)} onCheckedChange={(checked) => setAccountSkill(skill.id, checked)} disabled={!current || pending || !skill.enabled} /> {skill.name}</label>)}</div><FieldDescription>{t("Only skills enabled in general settings can be selected.")}</FieldDescription></Field>
        <Field><FieldLabel htmlFor="account-editorial-instruction">{t("Additional instructions for this account")}</FieldLabel><Textarea id="account-editorial-instruction" value={accountInstruction} onChange={(event) => setAccountInstruction(event.target.value)} disabled={!current || pending} className="min-h-28" maxLength={6000} /><FieldDescription>{t("Added to the shared instructions. If left blank, only the shared instructions are used.")}</FieldDescription></Field>
        </div></details>
        <details key={selected} className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">{t("Advanced profile fields ⁜ JSON ⁜ Schema v{version}", { version: STYLE_PROFILE_SCHEMA_VERSION })}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{t("Only supported account profile fields are accepted. Account routing and voice analysis derived from its own posts may appear here. This JSON cannot change publishing safety or approval rules.")}</p>
          <Textarea id="style-profile" aria-label={t("Advanced profile fields ⁜ JSON ⁜ Schema v{version}", { version: STYLE_PROFILE_SCHEMA_VERSION })} className="mt-3 min-h-72 font-mono text-xs" value={advancedText} onChange={(event) => updateAdvancedProfile(event.target.value)} disabled={!current || pending} aria-invalid={Boolean(advancedError)} />
          {advancedError && <p className="mt-2 text-sm text-destructive" role="alert">{advancedError}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{advancedChanges.length ? t("Unsaved changes in {count} profile fields.", { count: number.format(advancedChanges.length) }) : t("No changes in advanced fields.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={undoAdvancedProfile} disabled={!current || pending || !advancedEdited}>{t("Undo advanced edits")}</Button>
          </div>
          {advancedChanges.length > 0 && <ul className="mt-3 grid gap-2 text-xs" aria-label={t("Advanced profile changes")}>{advancedChanges.map((change) => <li key={change.key} className="rounded border p-2"><strong>{change.key}</strong><div className="mt-1 grid gap-1 sm:grid-cols-2"><span className="break-words text-muted-foreground">{t("Before")}: {change.before === undefined ? t("(none)") : diffValue(change.before)}</span><span className="break-words">{t("After")}: {change.after === undefined ? t("(none)") : diffValue(change.after)}</span></div></li>)}</ul>}
        </details>
        <div className="flex flex-wrap gap-2"><Button onClick={saveAccount} disabled={!current || pending}>{pendingAction === "account" ? <Spinner data-icon="inline-start" /> : null} {t("Save preferences")}</Button><Button type="button" variant="outline" onClick={discardAccountChanges} disabled={!current || pending}>{t("Restore saved")}</Button></div>
      </CardContent></Card>
    </div>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{t("Shared example style and writing skills")}</summary><div className="mt-4 flex flex-col gap-5">
    <Card><CardHeader><CardTitle>{t("Example post style")}</CardTitle><CardDescription>{t("Shared writing profile for example posts created without selecting an account.")}</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <Field><FieldLabel htmlFor="example-tone">{t("Tone")}</FieldLabel><Input id="example-tone" value={example.tone || ""} onChange={(event) => updateExample("tone", event.target.value)} disabled={pending} /></Field>
      <Field><FieldLabel htmlFor="example-opening">{t("Opening")}</FieldLabel><Input id="example-opening" value={example.opening || ""} onChange={(event) => updateExample("opening", event.target.value)} disabled={pending} /></Field>
      <Field><FieldLabel htmlFor="example-emoji">{t("Emoji")}</FieldLabel><Input id="example-emoji" value={example.emoji || ""} onChange={(event) => updateExample("emoji", event.target.value)} disabled={pending} /></Field>
      <Field className="md:col-span-2"><FieldLabel htmlFor="example-format">{t("Format rule")}</FieldLabel><Input id="example-format" value={example.formatRule || ""} onChange={(event) => updateExample("formatRule", event.target.value)} disabled={pending} /><FieldDescription>{t("A visible source name is added only when the source post carries an explicit special-report label.")}</FieldDescription></Field>
      <Field className="md:col-span-2"><FieldLabel htmlFor="example-editorial-instruction">{t("Shared auto-hitmaker instructions")}</FieldLabel><Textarea id="example-editorial-instruction" value={example.editorialInstruction || ""} onChange={(event) => updateExample("editorialInstruction", event.target.value)} disabled={pending} className="min-h-36" /><FieldDescription>{t("The editorial voice for all generated content. These instructions cannot change source safety, originality, character limits, or publishing gates.")}</FieldDescription></Field>
      <Field className="md:col-span-2"><FieldLabel>{t("Skills enabled for this example post")}</FieldLabel><div className="flex flex-wrap gap-3">{settings.skills.map((skill) => <label key={skill.id} className="flex items-center gap-2 text-sm"><Checkbox checked={(example.writingSkillIds || settings.skills.filter((item) => item.enabled).map((item) => item.id)).includes(skill.id)} onCheckedChange={(checked) => setExampleSkill(skill.id, checked)} disabled={pending || !skill.enabled} /> {skill.name}</label>)}</div></Field>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("Writing skills")}</CardTitle><CardDescription>{t("These are local text rules based on reviewed Skills.sh sources. The app does not run external skills, scripts, or MCP servers.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      {settings.skills.map((skill) => <div key={skill.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-medium">{skill.name}</h3><Badge variant={skill.enabled ? "default" : "outline"}>{skill.enabled ? t("Enabled") : t("Off")}</Badge></div><a className="mt-1 block text-xs text-muted-foreground hover:underline" href={skill.sourceUrl} target="_blank" rel="noreferrer">{skill.sourceUrl}</a><p className="mt-1 text-xs text-muted-foreground">{skill.reviewedRevision}</p></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={skill.enabled} onCheckedChange={(checked) => updateSkill(skill.id, { enabled: checked })} disabled={pending} /> {t("Enabled")}</label></div><Field className="mt-4"><FieldLabel htmlFor={`skill-${skill.id}`}>{t("Local instructions")}</FieldLabel><Textarea id={`skill-${skill.id}`} value={skill.instructions} onChange={(event) => updateSkill(skill.id, { instructions: event.target.value })} disabled={pending} className="min-h-28" /></Field><Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => resetSkill(skill.id)} disabled={pending}>{t("Restore reviewed default")}</Button></div>)}
      <Button onClick={saveSettings} disabled={pending}>{pendingAction === "settings" ? <Spinner data-icon="inline-start" /> : null} {t("Save example style and writing skills")}</Button>
    </CardContent></Card>

    </div></details>
    {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
  </div>;
}
