"use client";

import { useEffect, useState } from "react";
import { useUiText } from "@/i18n/ui-client";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  return ({ blue: "Blue verified", organization: "Organization verified", government: "Government verified", not_verified: "Not verified", unknown: "Unknown" })[status || "unknown"];
}

function verificationClass(status: SourceConfig["profile"]["blueCheckStatus"]): string {
  return status === "blue" ? "text-primary" : status === "organization" ? "text-amber-600" : status === "government" ? "text-indigo-600" : "text-muted-foreground";
}

type SourceAccount = { id: number; handle: string; displayName: string };

export function SourcesPage({ accounts, initial, initialAvailable, initialDeleted, initialWarnings }: { accounts: SourceAccount[]; initial: SourceConfig[]; initialAvailable: SourceConfig[]; initialDeleted: DeletedSource[]; initialWarnings: DeletedSource[] }) {
  const { t, locale } = useUiText();
  const number = new Intl.NumberFormat(locale);
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
    if (!response.ok) return setMessage(t(body.error || "Could not add source to account."));
    const next = await reload();
    const source = next.find((item) => item.handle === sourceToAdd);
    if (source) setDraft(draftFrom(source));
    setSourceToAdd("");
    setMessage(t("Source added to this publishing account."));
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
    if (!response.ok) return setMessage(t(body.error || "Could not save source."));
    if (draft.handle && !(await saveSourceCategories(draft.handle))) return setMessage(t("Source saved, but category assignments could not be saved."));
    const next = await reload();
    const saved = next.find((source) => source.handle === draft.handle);
    if (saved) setDraft(draftFrom(saved));
    setMessage(t("Source saved."));
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
    setMessage(t("Source removed from this publishing account."));
  }

  async function scanSources() {
    setScanning(true);
    const response = await fetch("/api/scan", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(t(body.error || "Source scan failed."));
    await reload();
    setMessage(t("Found {posts} new posts ⁜ updated AI scores for {sources} sources.", { posts: number.format(body.postsNew || 0), sources: number.format(body.sourcesScored || 0) }));
  }

  async function checkLiveness() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check_liveness", accountId }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(t(body.error || "Bulk account check failed."));
    await reload();
    setMessage(t("Checked {checked} accounts: {alive} active, {deleted} deleted, {unreachable} unreachable, {warnings} identity warnings.", { checked: number.format(body.checked || 0), alive: number.format(body.alive || 0), deleted: number.format(body.deleted || 0), unreachable: number.format(body.unreachable || 0), warnings: number.format(body.identityWarnings || 0) }));
  }

  async function recoverTechnical() {
    setScanning(true);
    const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recover_technical", accountId }) });
    const body = await response.json().catch(() => ({}));
    setScanning(false);
    if (!response.ok) return setMessage(t(body.error || "Technical source recovery failed."));
    await reload();
    setMessage(t("Restored {recovered} sources ⁜ {unresolved} records are waiting for revalidation.", { recovered: number.format(body.recovered || 0), unresolved: number.format(body.unresolved || 0) }));
  }

  async function resetSources() {
    setPending(true);
    try {
      const response = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset", accountId }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setMessage(t(body.error || "Could not reset the source pool."));
      const next = await reload();
      const first = next.find((source) => source.profile.status !== "candidate") || next[0];
      setDraft(first ? draftFrom(first) : blankSource());
      setMessage(t("Source selections for this publishing account were cleared."));
      setResetOpen(false);
    } catch {
      setMessage(t("Could not reset the source pool. Check your connection and try again."));
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
            <EmptyTitle>{t("This section is empty")}</EmptyTitle>
          <EmptyDescription>{t("The source pool includes only initial AI accounts and sources you add manually.")}</EmptyDescription>
        </EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={() => setDraft(blankSource())}><Plus data-icon="inline-start" aria-hidden="true" /> {t("Add a 𝕏 account")}</Button></EmptyContent>
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
          className="h-auto min-h-20 justify-start gap-3 border border-transparent p-3 text-start"
          data-selected={selected}
          onClick={() => setDraft(draftFrom(source))}
        >
          <Avatar size="lg">
            {identityValid && source.profile.avatarUrl ? <AvatarImage src={source.profile.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(source)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="flex w-full items-center gap-2">
              <span className="flex items-center gap-1 truncate font-medium">{identityValid ? source.name : source.handle}{identityValid && source.profile.blueCheckStatus && source.profile.blueCheckStatus !== "not_verified" && source.profile.blueCheckStatus !== "unknown" ? <BadgeCheck className={verificationClass(source.profile.blueCheckStatus)} aria-label={t(verificationLabel(source.profile.blueCheckStatus))} /> : null}</span>
              {source.profile.pinned ? <Pin aria-label={t("Pinned source")} /> : null}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground">@{source.handle}{identityValid ? ` ⁜ ${number.format(Number(source.profile.followers || 0))} ${t("followers")}` : ` ⁜ ${t("Verifying profile identity")}`}</span>
            <span className="w-full truncate text-xs text-muted-foreground">{source.profile.niche || source.profile.topics?.join(" ⁜ ") || t("Niche not set")}</span>
            <Progress value={score} aria-label={t("{name} source score", { name: source.name })} className="w-full" />
          </div>
          <span className="flex flex-col items-end gap-1">
            <Badge variant={score >= 70 ? "default" : "outline"}>{score ? number.format(score) : "—"}</Badge>
            <Badge variant={source.enabled ? "secondary" : "outline"}>{t(({ active: "Active", candidate: "Candidate", deleted: "Removed", inactive: "Inactive", unreachable: "Unreachable" } as Record<string, string>)[source.profile.status || (source.enabled ? "active" : "inactive")] || source.profile.status || "Inactive")}</Badge>
          </span>
        </Button>
      );
    });
  }

  const selected = sources.find((source) => source.handle === draft.handle);
  const selectedEvidence = selected ? Number(selected.profile.evidenceWeight || 0) : 0;
  const selectedIsScored = Number(selected?.profile.lastScoredAt || 0) > 0;
  const evidenceLabel = selectedEvidence > 0
    ? t("Discovery evidence {evidence}", { evidence: number.format(selectedEvidence) })
    : selected?.profile.origin === "seed"
      ? t("No discovery evidence ⁜ initial")
      : t("Waiting for evidence");
  const selectedDescription = selected?.profile.scoreReason || (
    selected?.profile.status === "candidate"
      ? t("Discovery candidate. AI scoring starts when enough discovery evidence is available.")
      : t("Manual sources are pinned and can be excluded from automatic discovery and deletion.")
  );

  return (
    <div className="space-y-5">
      {accounts.length ? <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="min-w-64 flex-1"><FieldLabel htmlFor="sources-account">{t("Publishing account")}</FieldLabel><Select value={String(accountId)} onValueChange={switchAccount}><SelectTrigger id="sources-account" className="mt-2 w-full"><SelectValue>{(() => { const account = accounts.find((item) => item.id === accountId); return account ? `${account.displayName} ⁜ @${account.handle}` : t("Publishing account"); })()}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.displayName} ⁜ @{account.handle}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="min-w-64 flex-1"><FieldLabel htmlFor="account-source-add">{t("Add a source to this account")}</FieldLabel><Select value={sourceToAdd} onValueChange={(value) => setSourceToAdd(value || "")}><SelectTrigger id="account-source-add" className="mt-2 w-full"><SelectValue placeholder={t("Select a source")}>{(() => { const source = available.find((item) => item.handle === sourceToAdd); return source ? `@${source.handle} ⁜ ${source.name}` : undefined; })()}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{available.map((source) => <SelectItem key={source.handle} value={source.handle}>@{source.handle} ⁜ {source.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <Button onClick={addSource} disabled={!sourceToAdd || pending}><Plus data-icon="inline-start" aria-hidden="true" /> {t("Add source")}</Button>
      </div> : <Alert><AlertDescription>{t("Connect a 𝕏 publishing account before adding sources.")}</AlertDescription></Alert>}
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>@{accounts.find((account) => account.id === accountId)?.handle || "—"} {t("sources")}</CardTitle>
            <CardDescription>{t("{active} active ⁜ {candidates} discovery candidates ⁜ selections apply only to this publishing account.", { active: number.format(active.length), candidates: number.format(candidates.length) })}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="icon" variant="outline" onClick={scanSources} disabled={!accountId || scanning} aria-label={t("Scan source posts")} title={t("Scan source posts")}>
              {scanning ? <Spinner /> : <ScanSearch aria-hidden="true" />}
            </Button>
            <Button size="icon" variant="outline" onClick={() => setDraft(blankSource())} disabled={!accountId} aria-label={t("New source")} title={t("New source")}><Plus aria-hidden="true" /></Button>
            <details><summary className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium">{t("Maintenance")}</summary><div className="mt-2 flex flex-wrap gap-2"><Button size="icon" variant="outline" onClick={() => setResetOpen(true)} disabled={!accountId || pending || scanning} aria-label={t("Clear this account’s sources")} title={t("Clear this account’s sources")}><RotateCw aria-hidden="true" /></Button><Button size="icon" variant="outline" onClick={checkLiveness} disabled={!accountId || scanning || sources.length === 0} aria-label={t("Check sources for this account")} title={t("Check sources for this account")}>{scanning ? <Spinner /> : <UserRoundCheck aria-hidden="true" />}</Button><Button size="icon" variant="outline" onClick={recoverTechnical} disabled={!accountId || scanning || warnings.length === 0} aria-label={t("Review technical warnings")} title={t("Review technical warnings")}><RotateCcw aria-hidden="true" /></Button></div></details>
          </div>
        </CardHeader>
        <CardContent><Tabs defaultValue="active">
            <TabsList variant="line">
              <TabsTrigger value="active">{t("Active")} <Badge variant="outline">{number.format(active.length)}</Badge></TabsTrigger>
              <TabsTrigger value="candidates">{t("Candidates")} <Badge variant="outline">{number.format(candidates.length)}</Badge></TabsTrigger>
              <TabsTrigger value="warnings">{t("Technical warnings")} <Badge variant="outline">{number.format(warnings.length)}</Badge></TabsTrigger>
              <TabsTrigger value="deleted">{t("Removed")} <Badge variant="outline">{number.format(deleted.length)}</Badge></TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="flex flex-col gap-2 pt-3">{sourceList(active)}</TabsContent>
            <TabsContent value="candidates" className="flex flex-col gap-2 pt-3">{sourceList(candidates)}</TabsContent>
            <TabsContent value="warnings" className="flex flex-col gap-2 pt-3">
              {warnings.length ? warnings.map((item) => <div key={`${item.handle}-${item.deletedAt}`} className="rounded-lg border border-dashed p-3 text-sm"><div className="font-medium">@{item.handle}</div><div className="text-xs text-muted-foreground">{item.reason}</div></div>) : <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>{t("No technical warnings")}</EmptyTitle><EmptyDescription>{t("Identity and transport errors appear here. Sources are not deleted.")}</EmptyDescription></EmptyHeader></Empty>}
            </TabsContent>
            <TabsContent value="deleted" className="flex flex-col gap-2 pt-3">
              {deleted.length ? deleted.map((item) => <div key={`${item.handle}-${item.deletedAt}`} className="rounded-lg border border-dashed p-3 text-sm"><div className="font-medium">@{item.handle}</div><div className="text-xs text-muted-foreground">{t("Score")} {number.format(item.score)} ⁜ {item.reason || t("Manual removal")}</div></div>) : <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>{t("No removed sources")}</EmptyTitle><EmptyDescription>{t("Manual removals are listed here.")}</EmptyDescription></EmptyHeader></Empty>}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>{t("Source settings")}</CardTitle>
          <CardDescription>{selectedDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {selected ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.profile.origin || "manual"}</Badge>
              <Badge variant="outline">{selected.profile.scoreModel || t("Score pending")}</Badge>
              {selectedIsScored ? <Badge variant="outline">{t("confidence")} {number.format(Number(selected.profile.sourceConfidence || 0))}</Badge> : <Badge variant="outline">{t("Waiting for AI score")}</Badge>}
              {selectedIsScored ? <Badge variant={Number(selected.profile.sourceRisk || 0) >= 70 ? "destructive" : "outline"}>{t("Risk")} {number.format(Number(selected.profile.sourceRisk || 0))}</Badge> : null}
              <Badge variant="outline" title={t("Seed sources are added initially without a discovery chain.")}>{evidenceLabel}</Badge>
            </div>
          ) : null}
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="source-handle">{t("Handle")}</FieldLabel>
                <Input id="source-handle" value={draft.handle} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, handle: event.target.value.replace(/^@/, "").toLowerCase() })} placeholder="@elonmusk" />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-name">{t("Name")}</FieldLabel>
                <Input id="source-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("Display name")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-niche">{t("Source niche")}</FieldLabel>
                <FieldDescription>{t("The main topic for this account. A global niche is not used.")}</FieldDescription>
                <Input id="source-niche" value={draft.niche} onChange={(event) => setDraft({ ...draft, niche: event.target.value })} placeholder={t("example: economy and finance")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-topics">{t("Subtopics")}</FieldLabel>
                <FieldDescription>{t("Separate with commas.")}</FieldDescription>
                <Input id="source-topics" value={draft.topics} onChange={(event) => setDraft({ ...draft, topics: event.target.value })} placeholder={t("stocks, inflation, companies")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-tone">{t("Source tone")}</FieldLabel>
                <Input id="source-tone" value={draft.tone} onChange={(event) => setDraft({ ...draft, tone: event.target.value })} placeholder={t("analytical, concise, critical")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="source-max">{t("Post limit")}</FieldLabel>
                <FieldDescription>{t("Maximum number of posts fetched in one scan.")}</FieldDescription>
                <Input id="source-max" type="number" min={1} max={50} value={draft.maxPosts} onChange={(event) => setDraft({ ...draft, maxPosts: Number(event.target.value) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rights">{t("Usage rights")}</FieldLabel>
                <Select value={draft.rightsStatus} onValueChange={(value) => setDraft({ ...draft, rightsStatus: value as SourceDraft["rightsStatus"] })}>
                  <SelectTrigger id="rights" className="w-full" aria-label={t("Usage rights")}><SelectValue>{t(({ unknown: "Unknown", cleared: "Cleared", prohibited: "Prohibited" } as Record<string, string>)[draft.rightsStatus])}</SelectValue></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="unknown">{t("Unknown")}</SelectItem>
                    <SelectItem value="cleared">{t("Cleared")}</SelectItem>
                    <SelectItem value="prohibited">{t("Prohibited")}</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">{t("Which account categories should use this source?")}</legend>
            {accountCategories.length ? accountCategories.map((category) => <label key={category.categoryId} className="flex min-h-10 items-center gap-3 text-sm"><Checkbox checked={sourceCategoryIds.includes(category.categoryId)} onCheckedChange={(checked) => setSourceCategoryIds((current) => checked ? [...new Set([...current, category.categoryId])] : current.filter((id) => id !== category.categoryId))} />{category.categoryName}</label>) : <p className="text-sm text-muted-foreground">{t("Select categories for this publishing account first.")}</p>}
          </fieldset>
          <Field orientation="horizontal">
            <FieldContent><FieldLabel htmlFor="source-enabled">{t("Source active")}</FieldLabel><FieldDescription>{t("Active sources are included in intake scans.")}</FieldDescription></FieldContent>
            <Switch id="source-enabled" checked={draft.enabled} onCheckedChange={(value) => setDraft({ ...draft, enabled: value })} />
          </Field>
          <Field orientation="horizontal">
            <FieldContent><FieldLabel htmlFor="source-pinned">{t("Protect from automatic removal")}</FieldLabel><FieldDescription>{t("Pinned sources are not removed even when they receive a low AI score.")}</FieldDescription></FieldContent>
            <Switch id="source-pinned" checked={draft.pinned} onCheckedChange={(value) => setDraft({ ...draft, pinned: value })} />
          </Field>
          {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} {t("Save")}</Button>
            {draft.handle ? <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={pending}><Trash2 data-icon="inline-start" aria-hidden="true" /> {t("Remove source")}</Button> : null}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remove @{handle}?", { handle: draft.handle })}</AlertDialogTitle>
            <AlertDialogDescription>{t("The source is removed only from the selected publishing account. The source catalog and historical post evidence are preserved.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>{t("Remove source")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Reset the source pool to its defaults?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Source and category selections for this account will be cleared. The source catalog and collected post history are preserved.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetSources} disabled={pending}>{t("Reset to defaults")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
