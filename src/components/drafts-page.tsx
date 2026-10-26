"use client";

import { PublishingMethods } from "@/components/publishing-methods";
import { postViewUrl } from "@/lib/post-url";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export function DraftsPage({ initial, accounts, selectedDraftId, sourcePostId }: { initial: DraftRecord[]; accounts: Account[]; selectedDraftId?: number; sourcePostId?: string }) {
  const { t, locale } = useUiText();
  const enabledAccounts = accounts.filter((account) => account.enabled);
  const defaultSelected = enabledAccounts.map((account) => account.id);
  const [drafts, setDrafts] = useState(initial);
  const [form, setForm] = useState<DraftForm>({ ...asForm(selectedDraft(initial, selectedDraftId)), ...(sourcePostId ? { externalId: sourcePostId, id: undefined, format: "reply" } : {}) });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>(defaultSelected);
  const [variantMode, setVariantMode] = useState<"per_account" | "same_text">("per_account");
  const [prompt, setPrompt] = useState("");
  const [manualText, setManualText] = useState("");
  const [composeMode, setComposeMode] = useState<"generate" | "manual">("generate");
  const [batchDraftIds, setBatchDraftIds] = useState<number[]>([]);
  const [revisions, setRevisions] = useState<DraftRevision[]>([]);

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
      .then((items) => { if (active) setRevisions(items); });
    return () => { active = false; };
  }, [form.id]);

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
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not save draft."));
    await reload();
    setForm(asForm(body));
    await loadRevisions(body.id);
    setMessage(t("Draft saved."));
  }

  async function generateFromMarket() {
    if (!form.externalId) return setMessage(t("A source post ID is required for market generation. Use the brief above for a freeform draft."));
    setPending(true);
    const response = await fetch("/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalId: form.externalId, accountId: form.accountId, format: form.format }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not generate a draft."));
    await reload();
    setForm(asForm(body));
    setMessage(t("A variant was created from the market source."));
  }

  async function createBatch() {
    if (!selectedAccounts.length) return setMessage(t("Select at least one active account for the batch."));
    if (composeMode === "generate" && !prompt.trim()) return setMessage(t("Write a brief for AI generation."));
    if (composeMode === "manual" && !manualText.trim()) return setMessage(t("The post text cannot be empty."));
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
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not create the batch."));
    setBatchDraftIds((body.drafts || []).map((draft: DraftRecord) => draft.id));
    setDrafts((current) => [...body.drafts, ...current.filter((draft) => !(body.drafts as DraftRecord[]).some((item) => item.id === draft.id))]);
    setForm(asForm(body.drafts?.[0]));
    setMessage(t("Prepared {count} account drafts using {mode}.", { count: body.drafts.length, mode: t(variantMode === "per_account" ? "separate style variants" : "the same text") }));
  }

  async function queueBatch() {
    if (!batchDraftIds.length) return setMessage(t("Create a batch first."));
    setPending(true);
    const response = await fetch("/api/drafts/batch/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftIds: batchDraftIds }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? t("Prepared {approvals} publication approvals and {jobs} engagement jobs.", { approvals: body.intents?.length || 0, jobs: body.jobs?.length || 0 }) : body.error ? t(body.error) : t("Could not add the batch to the queue."));
    if (response.ok) {
      await reload();
      setBatchDraftIds([]);
    }
  }

  async function queue() {
    if (!form.id) return setMessage(t("Save the draft first."));
    setPending(true);
    const response = await fetch(`/api/drafts/${form.id}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: form.accountId, action: form.format }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? t("A new publication approval was created. The previous expired approval was not renewed.") : body.error ? t(body.error) : t("Could not create the approval."));
    if (response.ok) await reload();
  }

  async function removeDraft() {
    if (!form.id || !window.confirm(t("Delete this draft?"))) return;
    setPending(true);
    const response = await fetch(`/api/drafts/${form.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ? t(body.error) : t("Could not delete the draft."));
    await reload();
    setForm(asForm());
    setMessage(t("Draft deleted."));
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("Create a post draft")}</CardTitle>
          <CardDescription>{t("Enter a brief or ready-made text to create drafts for your accounts, then complete sharing on 𝕏.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button variant={composeMode === "generate" ? "secondary" : "outline"} onClick={() => setComposeMode("generate")}> <AiIcon size={16} className="mr-2" /> {t("AI brief")}</Button>
            <Button variant={composeMode === "manual" ? "secondary" : "outline"} onClick={() => setComposeMode("manual")}>{t("Manual text")}</Button>
          </div>
          {composeMode === "generate" ? (
            <Field>
              <FieldLabel htmlFor="manual-prompt">{t("What should the post say?")}</FieldLabel>
              <Textarea id="manual-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("Example: Write a calm, evidence-based original post about youth unemployment in Türkiye.")} className="min-h-28" />
              <FieldDescription>{t("This text is sent to AI as input. No tool, shell, or SQL commands are run.")}</FieldDescription>
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
                <Select value={form.format} onValueChange={(value) => update("format", value ?? "post")}>
                  <SelectTrigger id="batch-format" className="w-full"><SelectValue>{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[form.format] || form.format)}</SelectValue></SelectTrigger>
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
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="batch-source-id">{t("Market source ID (optional)")}</FieldLabel>
              <Input id="batch-source-id" value={form.externalId} onChange={(event) => update("externalId", event.target.value)} placeholder={t("Source post ID")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="batch-source-url">{t("Source URL (optional)")}</FieldLabel>
              <Input id="batch-source-url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={createBatch} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <AiIcon size={16} className="mr-2" />} {t("Create batch")}</Button>
            <Button variant="secondary" onClick={queueBatch} disabled={pending || !batchDraftIds.length}><Send data-icon="inline-start" aria-hidden="true" /> {t("Add to queue for selected accounts")}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{t("Drafts")}</CardTitle>
              <CardDescription>{t("Account variants and quality gates stay here.")}</CardDescription>
            </div>
            <Button size="icon" variant="outline" onClick={() => setForm(asForm())} aria-label={t("New draft")}><Plus aria-hidden="true" /></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {drafts.length === 0 && (
              <Empty className="border border-dashed py-8">
                <EmptyHeader><EmptyTitle>{t("No drafts yet")}</EmptyTitle><EmptyDescription>{t("Start with a brief or ready-made text above.")}</EmptyDescription></EmptyHeader>
                <EmptyContent><Button variant="outline" onClick={() => setForm(asForm())}><Plus data-icon="inline-start" aria-hidden="true" /> {t("New draft")}</Button></EmptyContent>
              </Empty>
            )}
            {drafts.map((draft) => {
              const selected = form.id === draft.id;
              return (
                <Button key={draft.id} type="button" variant={selected ? "secondary" : "ghost"} className="h-auto min-h-28 flex-col items-stretch gap-2 border border-transparent p-3 text-left" data-selected={selected} onClick={() => { if (form.id !== draft.id) setRevisions([]); setForm(asForm(draft)); }}>
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
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="draft-account">{t("Publishing account")}</FieldLabel><Select value={form.accountId ? String(form.accountId) : null} onValueChange={(value) => update("accountId", value ? Number(value) : null)}><SelectTrigger id="draft-account" className="w-full"><SelectValue placeholder={t("Select an account")}>{accounts.find((account) => account.id === form.accountId) ? `@${accounts.find((account) => account.id === form.accountId)!.handle}` : t("Select an account")}</SelectValue></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>)}</SelectContent></Select></Field>
                <Field><FieldLabel htmlFor="draft-score">{t("Market score")}</FieldLabel><Input id="draft-score" value={form.score || "—"} readOnly /></Field>
                <Field><FieldLabel htmlFor="draft-source">{t("Source ID")}</FieldLabel><Input id="draft-source" value={form.externalId} onChange={(event) => update("externalId", event.target.value)} placeholder={t("Market post ID")} /></Field>
                <Field><FieldLabel htmlFor="draft-url">{t("Source URL")}</FieldLabel><Input id="draft-url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://..." /></Field>
              </div>
            </FieldGroup>
            <Field><FieldLabel htmlFor="draft-text">{t("Content")}</FieldLabel><Textarea id="draft-text" className="min-h-52" value={form.text} onChange={(event) => update("text", event.target.value)} placeholder={t("Original draft text...")} /><FieldDescription className="text-right">{new Intl.NumberFormat(locale).format(form.text.length)}/280 {t("characters")}</FieldDescription></Field>
            {form.id && <PublishingMethods key={form.id} draftId={form.id} />}
            {form.sourceUrl && <Link href={postViewUrl(form.sourceUrl)} className="text-sm text-primary underline-offset-4 hover:underline">{t("Open source post")}</Link>}
            {form.gateReason && <Alert variant={form.status === "blocked" ? "destructive" : "default"}><AlertDescription>{t("Quality gate")}: {form.gateReason}</AlertDescription></Alert>}
            {form.id ? <section aria-label={t("Draft revision history")} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-medium">{t("Revision history")}</h2><Badge variant="outline">{t("{count} revisions", { count: revisions.length })}</Badge></div>
              {revisions.length ? <ol className="flex flex-col gap-3">{revisions.map((revision) => <li key={revision.id} className="rounded-md bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={revision.revision === revisions[0]?.revision ? "secondary" : "outline"}>v{revision.revision}{revision.revision === revisions[0]?.revision ? ` ⁜ ${t("Current")}` : ""}</Badge><span className="text-xs text-muted-foreground">{t(({ post: "Original post", quote: "Quote (draft only)", reply: "Reply (draft only)", thread: "Thread (draft only)", dm: "DM (draft only)" } as Record<string, string>)[revision.format] || revision.format)}{revision.accountId ? ` ⁜ ${t("Account")} #${revision.accountId}` : ` ⁜ ${t("No account")}`}</span></div><time className="text-xs text-muted-foreground" dateTime={new Date(revision.createdAt * 1000).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(revision.createdAt * 1000)}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{revision.text}</p>
              </li>)}</ol> : <p className="text-sm text-muted-foreground">{t("No revision history yet.")}</p>}
            </section> : null}
            {form.evaluation ? (
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t("Draft performance evaluator")}</div>
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
              </div>
            ) : null}
            {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} {t("Save")}</Button>
              <Button variant="outline" onClick={generateFromMarket} disabled={pending}><AiIcon size={16} className="mr-2" /> {t("Market variant")}</Button>
              <Button variant="secondary" onClick={queue} disabled={pending}><Send data-icon="inline-start" aria-hidden="true" /> {t("Add to queue")}</Button>
              <Button variant="destructive" onClick={removeDraft} disabled={pending || !form.id}><Trash2 data-icon="inline-start" aria-hidden="true" /> {t("Delete")}</Button>
              <Badge variant="outline" className="gap-2"><Inbox aria-hidden="true" /> {t(({ draft: "Draft", ready: "Ready", blocked: "Blocked", queued: "Queued", pending_approval: "Pending approval", confirmed: "Confirmed" } as Record<string, string>)[form.status] || form.status)}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
