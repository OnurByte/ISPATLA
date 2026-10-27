"use client";

import { readDraftRecovery, retainDraftRecovery } from "@/lib/draft-recovery";
import { PublishingMethods } from "@/components/publishing-methods";
import { postViewUrl } from "@/lib/post-url";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Plus, Save, Send, Trash2 } from "lucide-react";
import { AiIcon } from "@/components/ai-icon";
import type { PgDraft as DraftRecord } from "@/server/postgres-drafts";
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
import { useUiText } from "@/i18n/ui-client";

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
  evaluation: DraftRecord["evaluation"];
};
const editableDraftFields = ["text", "format", "accountId", "externalId", "sourceUrl"] as const;

type Account = { id: number; handle: string; displayName: string; enabled: boolean; defaultAccount: boolean; styleProfile: Record<string, unknown> };

type DraftRevision = { id: number; draftId: number; revision: number; accountId: number | null; format: string; text: string; createdAt: number };

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
        evaluation: null,
      };
}

export function selectedDraft<T extends { id: number }>(drafts: T[], selectedDraftId?: number): T | undefined {
  return drafts.find((draft) => draft.id === selectedDraftId) || drafts[0];
}

function AccountPicker({ accounts, selected, onChange, t }: { accounts: Account[]; selected: number[]; onChange: (ids: number[]) => void; t: (message: string, params?: Record<string, string | number>) => string }) {
  const enabledAccounts = accounts.filter((account) => account.enabled);
  if (!enabledAccounts.length) {
    return (
      <Empty className="min-h-28 border border-dashed p-4">
        <EmptyHeader><EmptyTitle>{t("No active accounts")}</EmptyTitle><EmptyDescription>{t("Connect a publishing account before creating a batch.")}</EmptyDescription></EmptyHeader>
        <EmptyContent><Link href="/accounts" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Add account")}</Link></EmptyContent>
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
              <FieldDescription className="truncate">{account.displayName || account.styleProfile.tone as string || t("No style profile")}</FieldDescription>
            </FieldContent>
            {account.defaultAccount && <Badge variant="outline">{t("Default")}</Badge>}
          </Field>
        );
      })}
    </FieldSet>
  );
}

export function DraftsPage({ initial, accounts, selectedDraftId, sourcePostId, ownerId = "" }: { ownerId?: string; initial: DraftRecord[]; accounts: Account[]; selectedDraftId?: number; sourcePostId?: string }) {
  const { t, locale } = useUiText();
  const router = useRouter();
  type Recovery = { form: DraftForm; baseline: DraftForm; prompt: string; manualText: string; batchFormat: string; batchSourceId: string; batchSourceUrl: string; selectedAccounts: number[]; variantMode: "per_account" | "same_text"; composeMode: "generate" | "manual"; batchDraftIds: number[]; composerOpen: boolean };
  const context = `${selectedDraftId ?? "default"}:${sourcePostId ?? ""}`;
  const recovery = readDraftRecovery<Recovery>(ownerId, context);
  const enabledAccounts = accounts.filter((account) => account.enabled);
  const defaultSelected = enabledAccounts.map((account) => account.id);
  const [drafts, setDrafts] = useState(initial);
  const initialForm = sourcePostId ? { ...asForm(), externalId: sourcePostId, format: "reply" } : asForm(selectedDraft(initial, selectedDraftId));
  const latestRecoveredDraft = recovery?.form.id ? initial.find((draft) => draft.id === recovery.form.id) : undefined;
  const restoredBaseline = recovery ? (latestRecoveredDraft ? asForm(latestRecoveredDraft) : recovery.form.id ? asForm() : recovery.baseline) : initialForm;
  // Replay only unsaved field changes onto the current server revision. If the
  // old draft was deleted, retain its text as a new draft rather than an invalid ID.
  const restoredForm = recovery ? { ...restoredBaseline, ...Object.fromEntries(editableDraftFields.filter((field) => !latestRecoveredDraft || recovery.form[field] !== recovery.baseline[field]).map((field) => [field, recovery.form[field]])) } : initialForm;
  const [form, setForm] = useState<DraftForm>(restoredForm);
  const [baseline, setBaseline] = useState<DraftForm>(restoredBaseline);
  const [batchFormat, setBatchFormat] = useState(recovery?.batchFormat ?? (sourcePostId ? "reply" : "post"));
  const [batchSourceId, setBatchSourceId] = useState(recovery?.batchSourceId ?? sourcePostId ?? "");
  const [batchSourceUrl, setBatchSourceUrl] = useState(recovery?.batchSourceUrl ?? "");
  const [composerOpen, setComposerOpen] = useState(recovery?.composerOpen ?? (initial.length === 0 && !sourcePostId));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>(recovery?.selectedAccounts ?? defaultSelected);
  const [variantMode, setVariantMode] = useState<"per_account" | "same_text">(recovery?.variantMode ?? "per_account");
  const [prompt, setPrompt] = useState(recovery?.prompt ?? "");
  const [manualText, setManualText] = useState(recovery?.manualText ?? "");
  const [composeMode, setComposeMode] = useState<"generate" | "manual">(recovery?.composeMode ?? "generate");
  const [batchDraftIds, setBatchDraftIds] = useState<number[]>(recovery?.batchDraftIds ?? []);
  const [revisions, setRevisions] = useState<DraftRevision[]>([]);

  const hasChanges = editableDraftFields.some((field) => form[field] !== baseline[field]);

  const hasUnsavedInput = hasChanges || Boolean(prompt.trim() || manualText.trim());
  useEffect(() => {
    retainDraftRecovery<Recovery>(ownerId, context, hasUnsavedInput ? { form, baseline, prompt, manualText, batchFormat, batchSourceId, batchSourceUrl, selectedAccounts, variantMode, composeMode, batchDraftIds, composerOpen } : null);
  }, [ownerId, context, hasUnsavedInput, form, baseline, prompt, manualText, batchFormat, batchSourceId, batchSourceUrl, selectedAccounts, variantMode, composeMode, batchDraftIds, composerOpen]);


  function replaceEditor(draft?: DraftRecord) {
    const next = asForm(draft);
    setForm(next);
    setBaseline(next);
  }

  function mayReplaceEditor() {
    return !hasChanges || window.confirm(t("Discard unsaved changes?"));
  }

  function focusEditor() {
    requestAnimationFrame(() => document.getElementById("draft-text")?.focus());
  }

  function openDraft(draft?: DraftRecord) {
    if (pending || (draft?.id === form.id && draft !== undefined)) return;
    if (!mayReplaceEditor()) return;
    setRevisions([]);
    setMessage("");
    replaceEditor(draft);
    focusEditor();
  }

  async function withPending(action: () => Promise<void>, fallback: string) {
    if (pending) return;
    setPending(true);
    setMessage("");
    try { await action(); }
    catch { setMessage(fallback); }
    finally { setPending(false); }
  }

  async function loadRevisions(id?: number) {
    if (!id) return setRevisions([]);
    const response = await fetch(`/api/drafts/${id}/revisions`, { cache: "no-store" });
    setRevisions(response.ok ? await response.json() as DraftRevision[] : []);
  }

  useEffect(() => {
    if (!form.id) return;
    let active = true;
    fetch(`/api/drafts/${form.id}/revisions`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<DraftRevision[]> : [])
      .then((items) => { if (active) setRevisions(items); })
      .catch(() => { if (active) setRevisions([]); });
    return () => { active = false; };
  }, [form.id]);

  async function reload() {
    const response = await fetch("/api/drafts", { cache: "no-store" });
    if (!response.ok) throw new Error("Draft refresh failed");
    setDrafts(await response.json() as DraftRecord[]);
    router.refresh();
  }

  function update<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    return withPending(async () => {
      const response = await fetch(form.id ? `/api/drafts/${form.id}` : "/api/drafts", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not save draft."));
      await reload();
      replaceEditor(body);
      await loadRevisions(body.id);
      setMessage(t("Draft saved."));
    }, t("Could not save draft."));
  }

  async function generateFromMarket() {
    return withPending(async () => {
      if (!mayReplaceEditor()) return;
      if (!form.externalId) return setMessage(t("A source post ID is required for market generation. Use the brief above for a freeform draft."));
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalId: form.externalId, accountId: form.accountId, format: form.format }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not generate a draft."));
      await reload();
      replaceEditor(body);
      setMessage(t("A variant was created from the market source."));
    }, t("Could not generate a draft."));
  }

  async function createBatch() {
    return withPending(async () => {
      if (!mayReplaceEditor()) return;
      if (!selectedAccounts.length) return setMessage(t("Select at least one active account for the batch."));
      if (composeMode === "generate" && !prompt.trim()) return setMessage(t("Write a brief for AI generation."));
      if (composeMode === "manual" && !manualText.trim()) return setMessage(t("The post text cannot be empty."));
      const response = await fetch("/api/drafts/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: composeMode === "generate" ? prompt : "",
          text: composeMode === "manual" ? manualText : "",
          accountIds: selectedAccounts,
          format: batchFormat,
          variantMode,
          externalId: batchSourceId,
          sourceUrl: batchSourceUrl,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not create the batch."));
      setBatchDraftIds((body.drafts || []).map((draft: DraftRecord) => draft.id));
      setDrafts((current) => [...body.drafts, ...current.filter((draft) => !(body.drafts as DraftRecord[]).some((item) => item.id === draft.id))]);
      replaceEditor(body.drafts?.[0]);
      if (composeMode === "generate") setPrompt("");
      else setManualText("");
      setMessage(t("Prepared {count} account drafts using {mode}.", { count: body.drafts.length, mode: t(variantMode === "per_account" ? "separate style variants" : "the same text") }));
      setComposerOpen(false);
      router.refresh();
      focusEditor();
    }, t("Could not create the batch."));
  }

  async function queueBatch() {
    return withPending(async () => {
      if (hasChanges) return setMessage(t("Save changes before sharing or queueing."));
      if (!batchDraftIds.length) return setMessage(t("Create a batch first."));
      const response = await fetch("/api/drafts/batch/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftIds: batchDraftIds }),
      });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? t("Prepared {approvals} publication approvals and {jobs} engagement jobs.", { approvals: body.intents?.length || 0, jobs: body.jobs?.length || 0 }) : body.error ? t(body.error) : t("Could not add the batch to the queue."));
      if (response.ok) {
        await reload();
        setBatchDraftIds([]);
      }
    }, t("Could not add the batch to the queue."));
  }

  async function queue() {
    return withPending(async () => {
      if (hasChanges) return setMessage(t("Save changes before sharing or queueing."));
      if (!form.id) return setMessage(t("Save the draft first."));
      const response = await fetch(`/api/drafts/${form.id}/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: form.accountId, action: form.format }),
      });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? t("A new publication approval was created. The previous expired approval was not renewed.") : body.error ? t(body.error) : t("Could not create the approval."));
      if (response.ok) await reload();
    }, t("Could not create the approval."));
  }

  async function removeDraft() {
    return withPending(async () => {
      if (!form.id || !window.confirm(t("Delete this draft?"))) return;
      const response = await fetch(`/api/drafts/${form.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not delete the draft."));
      await reload();
      replaceEditor();
      setMessage(t("Draft deleted."));
    }, t("Could not delete the draft."));
  }

  return (
    <div className="flex flex-col gap-5">
      <details open={composerOpen} onToggle={(event) => setComposerOpen(event.currentTarget.open)} className="rounded-xl border bg-card text-card-foreground">
        <summary className="cursor-pointer px-6 py-4 font-medium">{t("Create a post draft")}</summary>
        <CardContent className="flex flex-col gap-5"><fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button variant={composeMode === "generate" ? "secondary" : "outline"} onClick={() => setComposeMode("generate")}> <AiIcon size={16} className="mr-2" /> {t("AI brief")}</Button>
            <Button variant={composeMode === "manual" ? "secondary" : "outline"} onClick={() => setComposeMode("manual")}>{t("Manual text")}</Button>
          </div>
          {composeMode === "generate" ? (
            <Field>
              <FieldLabel htmlFor="manual-prompt">{t("What should the post say?")}</FieldLabel>
              <Textarea id="manual-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("Example: Write a calm, evidence-based original post about youth unemployment in Türkiye.")} className="min-h-28" />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="manual-text">{t("Ready-made post")}</FieldLabel>
              <Textarea id="manual-text" value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder={t("Original text to publish from the selected accounts...")} className="min-h-28" />
              <FieldDescription className="text-right">{manualText.length}/280</FieldDescription>
            </Field>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
            <Field>
              <FieldLabel>{t("Accounts to publish from")}</FieldLabel>
              <AccountPicker accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} t={t} />
            </Field>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="batch-format">{t("Format")}</FieldLabel>
                <Select value={batchFormat} onValueChange={(value) => setBatchFormat(value ?? "post")}>
                  <SelectTrigger id="batch-format" className="w-full"><SelectValue>{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[batchFormat] || batchFormat)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">{t("Original post")}</SelectItem>
                    <SelectItem value="quote">{t("Quote (draft only)")}</SelectItem>
                    <SelectItem value="reply">{t("Reply (draft only)")}</SelectItem>
                    <SelectItem value="thread">{t("Thread (draft only)")}</SelectItem>
                    <SelectItem value="dm">{t("DM (draft only)")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border px-3 py-2.5 has-data-checked:border-primary has-data-checked:bg-primary/5">
                <Checkbox id="same-text" checked={variantMode === "same_text"} onCheckedChange={(value) => setVariantMode(value === true ? "same_text" : "per_account")} />
                <FieldContent>
                  <FieldLabel htmlFor="same-text" className="cursor-pointer">{t("Use the same text")}</FieldLabel>
                  <FieldDescription>{t("When off, a separate generation request uses each account's style profile.")}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{t("Source details")}</summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="batch-source-id">{t("Market source ID (optional)")}</FieldLabel>
              <Input id="batch-source-id" value={batchSourceId} onChange={(event) => setBatchSourceId(event.target.value)} placeholder={t("Source post ID")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-source-url">{t("Source URL (optional)")}</FieldLabel>
              <Input id="batch-source-url" value={batchSourceUrl} onChange={(event) => setBatchSourceUrl(event.target.value)} placeholder="https://..." />
            </Field>
          </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={createBatch} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <AiIcon size={16} className="mr-2" />} {t("Create batch")}</Button>
            <Button variant="secondary" onClick={queueBatch} disabled={pending || hasChanges || !batchDraftIds.length}><Send data-icon="inline-start" aria-hidden="true" /> {t("Add to queue for selected accounts")}</Button>
          </div>
        </fieldset></CardContent>
      </details>

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t("Drafts")}</CardTitle>
              <CardDescription>{t("Account variants and quality gates stay here.")}</CardDescription>
            </div>
            <Button size="icon" variant="outline" onClick={() => openDraft()} disabled={pending} aria-label={t("New draft")}><Plus aria-hidden="true" /></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {drafts.length === 0 && (
              <Empty className="border border-dashed py-8">
                <EmptyHeader><EmptyTitle>{t("No drafts yet")}</EmptyTitle><EmptyDescription>{t("Start with a brief or ready-made text above.")}</EmptyDescription></EmptyHeader>
                <EmptyContent><Button variant="outline" onClick={() => openDraft()} disabled={pending}><Plus data-icon="inline-start" aria-hidden="true" /> {t("New draft")}</Button></EmptyContent>
              </Empty>
            )}
            {drafts.map((draft) => {
              const selected = form.id === draft.id;
              return (
                <Button key={draft.id} type="button" variant={selected ? "secondary" : "ghost"} className="h-auto min-h-28 flex-col items-stretch gap-2 border border-transparent p-3 text-left" data-selected={selected} disabled={pending} onClick={() => openDraft(draft)}>
                  <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Badge variant="outline">{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[draft.format] || draft.format)}</Badge>{draft.evaluation ? <Badge variant="secondary">{t("Draft")} {draft.evaluation.score}</Badge> : null}</span><Badge variant={draft.status === "ready" ? "default" : draft.status === "blocked" ? "destructive" : "secondary"}>{t(({ draft: "Draft", ready: "Ready", blocked: "Blocked", queued: "Queued", pending_approval: "Pending approval", confirmed: "Confirmed" } as Record<string, string>)[draft.status] || draft.status)}</Badge></span>
                  <span className="line-clamp-3 text-sm font-normal">{draft.text}</span>
                  <span className="text-xs font-normal text-muted-foreground">@{draft.accountHandle} ⁜ {draft.origin ? draft.origin === "manual" ? t("Manual") : draft.origin : t("Manual")}{draft.batchId ? ` ⁜ ${draft.batchId.slice(0, 12)}` : ""}</span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("Draft editor")}</CardTitle><CardDescription>{t("Edit the text, account, and gate result for one draft.")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-5"><fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="draft-account">{t("Publishing account")}</FieldLabel><Select value={form.accountId ? String(form.accountId) : null} onValueChange={(value) => update("accountId", value ? Number(value) : null)}><SelectTrigger id="draft-account" className="w-full"><SelectValue placeholder={t("Select an account")}>{accounts.find((account) => account.id === form.accountId) ? `@${accounts.find((account) => account.id === form.accountId)!.handle}` : t("Select an account")}</SelectValue></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>)}</SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="draft-format">{t("Format")}</FieldLabel><Select value={form.format} onValueChange={(value) => update("format", value ?? "post")}><SelectTrigger id="draft-format" className="w-full"><SelectValue>{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[form.format] || form.format)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="post">{t("Original post")}</SelectItem><SelectItem value="quote">{t("Quote (draft only)")}</SelectItem><SelectItem value="reply">{t("Reply (draft only)")}</SelectItem><SelectItem value="thread">{t("Thread (draft only)")}</SelectItem><SelectItem value="dm">{t("DM (draft only)")}</SelectItem></SelectContent></Select></Field>
              </div>
            </FieldGroup>
            <Field><FieldLabel htmlFor="draft-text">{t("Content")}</FieldLabel><Textarea id="draft-text" className="min-h-52" value={form.text} onChange={(event) => update("text", event.target.value)} placeholder={t("Original draft text...")} /><FieldDescription className="text-right">{new Intl.NumberFormat(locale).format(form.text.length)}/280 {t("characters")}</FieldDescription></Field>
            {hasChanges && <p role="status" className="text-sm text-muted-foreground">{t("Save changes before sharing or queueing.")}</p>}
            {form.id && !hasChanges && <PublishingMethods key={form.id} draftId={form.id} />}
            <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{t("Source details")}</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="draft-score">{t("Market score")}</FieldLabel><Input id="draft-score" value={form.score || "—"} readOnly /></Field>
                <Field><FieldLabel htmlFor="draft-source">{t("Source ID")}</FieldLabel><Input id="draft-source" value={form.externalId} onChange={(event) => update("externalId", event.target.value)} placeholder={t("Market post ID")} /></Field>
                <Field><FieldLabel htmlFor="draft-url">{t("Source URL")}</FieldLabel><Input id="draft-url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://..." /></Field>
            </div></details>
            {form.sourceUrl && <Link href={postViewUrl(form.sourceUrl)} className="text-sm text-primary underline-offset-4 hover:underline">{t("Open source post")}</Link>}
            {form.gateReason && <Alert variant={form.status === "blocked" ? "destructive" : "default"}><AlertDescription>{t("Quality gate")}: {form.gateReason}</AlertDescription></Alert>}
            {form.id ? <details aria-label={t("Draft revision history")} className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("Revision history")} <Badge variant="outline">{t("{count} revisions", { count: revisions.length })}</Badge></summary>
              {revisions.length ? <ol className="flex flex-col gap-3">{revisions.map((revision) => <li key={revision.id} className="rounded-md bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={revision.revision === revisions[0]?.revision ? "secondary" : "outline"}>v{revision.revision}{revision.revision === revisions[0]?.revision ? ` ⁜ ${t("Current")}` : ""}</Badge><span className="text-xs text-muted-foreground">{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[revision.format] || revision.format)}{revision.accountId ? ` ⁜ ${t("Account")} #${revision.accountId}` : ` ⁜ ${t("No account")}`}</span></div><time className="text-xs text-muted-foreground" dateTime={new Date(revision.createdAt * 1000).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(revision.createdAt * 1000)}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{revision.text}</p>
              </li>)}</ol> : <p className="text-sm text-muted-foreground">{t("No revision history yet.")}</p>}
            </details> : null}
            {form.evaluation ? (
              <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{t("Draft performance evaluator")}</summary><div className="mt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mt-1 text-xs text-muted-foreground">{t("Shadow mode; this is not 𝕏's internal ranking score or a reach guarantee.")}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{form.evaluation.score}/100</Badge>
                    <Badge variant="outline">{t("Raw confidence {score}/100 ⁜ not calibrated", { score: new Intl.NumberFormat(locale).format(form.evaluation.confidence) })}</Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">{t("Baseline")}</div>
                    <div className="mt-1 text-sm font-medium">{t("{count} samples", { count: new Intl.NumberFormat(locale).format(form.evaluation.baseline.samples) })}</div>
                    <div className="text-xs text-muted-foreground">{t(({ account_category_format: "Account, category, and format", account_format: "Account and format", account: "Account", none: "No baseline" } as Record<string, string>)[form.evaluation.baseline.scope] || form.evaluation.baseline.scope)}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">{t("Expected residual")}</div>
                    <div className="mt-1 text-sm font-medium">{form.evaluation.predictedResidual === null ? t("Insufficient data") : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(form.evaluation.predictedResidual) + "x"}</div>
                    <div className="text-xs text-muted-foreground">{t("Compared with the account's baseline")}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">{t("Estimated views")}</div>
                    <div className="mt-1 text-sm font-medium">{form.evaluation.predictedViews === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(form.evaluation.predictedViews))}</div>
                    <div className="text-xs text-muted-foreground">{t("Only when a mature baseline is available")}</div>
                  </div>
                </div>
                {(form.evaluation.helped.length || form.evaluation.hurt.length) ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><div className="mb-1 text-xs font-medium">{t("Strengths")}</div>{form.evaluation.helped.length ? form.evaluation.helped.map((reason) => <div key={reason} className="text-xs text-muted-foreground">+ {reason}</div>) : <div className="text-xs text-muted-foreground">{t("No notable signal")}</div>}</div>
                    <div><div className="mb-1 text-xs font-medium">{t("Weaknesses")}</div>{form.evaluation.hurt.length ? form.evaluation.hurt.map((reason) => <div key={reason} className="text-xs text-muted-foreground">- {reason}</div>) : <div className="text-xs text-muted-foreground">{t("No notable signal")}</div>}</div>
                  </div>
                ) : null}
              </div></details>
            ) : null}
            {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} {t("Save")}</Button>
              {form.externalId && <Button variant="outline" onClick={generateFromMarket} disabled={pending}><AiIcon size={16} className="mr-2" /> {t("Market variant")}</Button>}
              <Button variant="secondary" onClick={queue} disabled={pending || hasChanges || !form.id}><Send data-icon="inline-start" aria-hidden="true" /> {t("Add to queue")}</Button>
              <Button variant="destructive" onClick={removeDraft} disabled={pending || !form.id}><Trash2 data-icon="inline-start" aria-hidden="true" /> {t("Delete")}</Button>
              <Badge variant="outline" className="gap-2"><Inbox aria-hidden="true" /> {t(({ draft: "Draft", ready: "Ready", blocked: "Blocked", queued: "Queued", pending_approval: "Pending approval", confirmed: "Confirmed" } as Record<string, string>)[form.status] || form.status)}</Badge>
            </div>
          </fieldset></CardContent>
        </Card>
      </div>
    </div>
  );
}
