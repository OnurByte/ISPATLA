"use client";
import { postViewUrl } from "@/lib/post-url";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Play, RefreshCw, RotateCcw } from "lucide-react";
import type { AutomationJob, PublicationIntent } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUiText } from "@/i18n/ui-client";

function variant(status: string): "default" | "secondary" | "destructive" | "outline" {
  return status === "submitted" || status === "confirmed" ? "default" : status === "blocked" || status === "failed" || status === "dead_letter" ? "destructive" : status === "queued" ? "secondary" : "outline";
}

function time(value: number, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(value * 1000) : "—";
}

function intentStatus(status: string) {
  return new Set(["pending_approval", "approved", "dispatching", "pending_reconciliation", "confirmed", "blocked", "cancelled", "expired", "reconciliation_required", "dead_letter"]).has(status)
    ? status : "unknown_remote_state";
}

function supportedAction(action: string) {
  return ["post", "repost", "reply"].includes(action);
}

export function filterQueueItems<T extends { status: string }>(items: T[], status: string): T[] {
  return status === "all" ? items : items.filter((item) => item.status === status);
}

export function queueDateKey(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp * 1000);
}

export function approvalExpiryLabel(expiresAt: number | null, locale = "en", t: (message: string) => string = (message) => message): string {
  return expiresAt ? time(expiresAt, locale) : t("The API did not provide an expiry time.");
}

export function needsManualReview(status: string): boolean {
  return ["pending_reconciliation", "reconciliation_required", "unknown_remote_state"].includes(status);
}

export function canRetryJob(status: string): boolean {
  return status === "blocked";
}

export function canCreateFreshApproval(status: string): boolean {
  return status === "expired";
}

export function QueuePage({ initial, initialIntents, initialStatus = "all", initialView = "list" }: { initial: AutomationJob[]; initialIntents: PublicationIntent[]; initialStatus?: string; initialView?: "list" | "calendar" }) {
  const { t, locale } = useUiText();
  const statusLabel = (status: string) => {
    const labels: Record<string, string> = { pending_approval: "Pending approval", approved: "Approved", dispatching: "Sending", running: "Sending", submitted: "Submitted", queued: "Queued", blocked: "Blocked", failed: "Failed", dead_letter: "Dead letter", pending_reconciliation: "Verification pending", reconciliation_required: "Reconciliation required", confirmed: "Confirmed", cancelled: "Cancelled", expired: "Approval expired", unknown_remote_state: "Unknown remote state", not_started: "Not started" };
    return labels[status] ? t(labels[status]) : status;
  };
  const [jobs, setJobs] = useState(initial);
  const [intents, setIntents] = useState(initialIntents);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(0);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [view, setView] = useState(initialView);

  function syncUrl(status: string, nextView: "list" | "calendar") {
    const params = new URLSearchParams(window.location.search);
    if (status === "all") params.delete("status"); else params.set("status", status);
    if (nextView === "list") params.delete("view"); else params.set("view", nextView);
    const query = params.toString();
    window.history.pushState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setStatusFilter(status);
    setView(nextView);
  }

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setStatusFilter(params.get("status") || "all");
      setView(params.get("view") === "calendar" ? "calendar" : "list");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const visibleJobs = filterQueueItems(jobs, statusFilter);
  const visibleIntents = filterQueueItems(intents, statusFilter);
  const calendarGroups = new Map<string, { jobs: AutomationJob[]; intents: PublicationIntent[] }>();
  for (const job of visibleJobs) {
    const key = queueDateKey(job.scheduledAt);
    const group = calendarGroups.get(key) || { jobs: [], intents: [] };
    group.jobs.push(job);
    calendarGroups.set(key, group);
  }
  for (const intent of visibleIntents) {
    const key = queueDateKey(intent.requestedAt);
    const group = calendarGroups.get(key) || { jobs: [], intents: [] };
    group.intents.push(intent);
    calendarGroups.set(key, group);
  }

  async function reload() {
    const [nextJobs, nextIntents] = await Promise.all([
      fetch("/api/queue", { cache: "no-store" }).then((response) => response.json() as Promise<AutomationJob[]>),
      fetch("/api/publications", { cache: "no-store" }).then((response) => response.json() as Promise<PublicationIntent[]>),
    ]);
    setJobs(nextJobs);
    setIntents(nextIntents);
  }

  async function actOnIntent(id: number, action: "approve" | "cancel") {
    setPending(-id);
    const response = await fetch(`/api/publications/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json().catch(() => ({}));
    setPending(0);
    setMessage(response.ok ? action === "approve" ? t("Publication intent approved; the official 𝕏 API worker will process it.") : t("Publication intent cancelled.") : t(body.error || "Could not update the publication intent."));
    await reload();
  }

  async function renewApproval(draftId: number, accountId: number | null, action: string) {
    if (!accountId) return setMessage(t("The API response did not include an account ID for the new approval."));
    setPending(-draftId);
    try {
      const response = await fetch(`/api/drafts/${draftId}/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, action }),
      });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? t("A new approval was created. The previous expired approval was not renewed.") : t(body.error || "Could not create a new approval."));
      if (response.ok) await reload();
    } catch {
      setMessage(t("The new approval request did not finish. Refresh and check the status."));
    } finally {
      setPending(0);
    }
  }

  async function run(id: number) {
    setPending(id);
    const response = await fetch(`/api/queue/${id}/run`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(0);
    setMessage(response.ok ? (body.ok ? t("𝕏 accepted the request; remote publication evidence is pending.") : t(body.reason || "The job was blocked.")) : t(body.error || "The job did not run."));
    await reload();
  }

  async function cancel(id: number) {
    setPending(id);
    await fetch(`/api/queue/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    setPending(0);
    await reload();
  }

  async function retry(id: number) {
    setPending(id);
    await fetch(`/api/queue/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "queued" }) });
    setPending(0);
    await reload();
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <CardTitle>{t("Publication queue")}</CardTitle>
          <CardDescription>{t("Track prepared publications and verified sharing outcomes.")}</CardDescription>
        </div>
        <Button variant="outline" onClick={reload} disabled={pending > 0}>
          <RefreshCw data-icon="inline-start" aria-hidden="true" /> {t("Refresh")}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="queue-status" className="text-sm font-medium">{t("Status")}</label>
          <select id="queue-status" className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => syncUrl(event.target.value, view)}>
          <option value="all">{t("All")}</option>{["pending_approval", "approved", "dispatching", "queued", "blocked", "failed", "dead_letter", "pending_reconciliation", "reconciliation_required", "confirmed", "cancelled", "expired"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <div className="ml-auto flex gap-2"><Button size="sm" variant={view === "list" ? "secondary" : "outline"} onClick={() => syncUrl(statusFilter, "list")}>{t("List")}</Button><Button size="sm" variant={view === "calendar" ? "secondary" : "outline"} onClick={() => syncUrl(statusFilter, "calendar")}>{t("Calendar")}</Button></div>
        </div>
        {view === "calendar" ? <div className="flex flex-col gap-3" aria-label={t("Queue calendar")}>
        {[...calendarGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, group]) => <section key={day} className="rounded-lg border p-4"><h3 className="mb-3 text-sm font-semibold">{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "Europe/Istanbul" }).format(new Date(`${day}T12:00:00+03:00`))}</h3><div className="flex flex-col gap-2">{group.jobs.map((job) => <div key={`job-${job.id}`} className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">{time(job.scheduledAt, locale)}</Badge><span>{t("Job")} #{job.id} ⁜ {t("Draft")} #{job.draftId}</span><Badge variant={variant(job.status)}>{statusLabel(job.status)}</Badge>{job.approvalSnapshotId && <span className="text-muted-foreground">{t("Approval record")} #{job.approvalSnapshotId} ⁜ {t("Expires")} {approvalExpiryLabel(job.approvalExpiresAt, locale, t)}{job.status === "expired" ? ` ⁜ ${statusLabel("expired")}` : ""}</span>}{job.reason && <span className="text-muted-foreground">{t(job.reason)}</span>}</div>)}{group.intents.map((intent) => <div key={`intent-${intent.id}`} className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline">{time(intent.requestedAt, locale)}</Badge><span>{t("Publication intent")} #{intent.id} ⁜ @{intent.accountHandle}</span><Badge variant={variant(intentStatus(intent.status))}>{statusLabel(intentStatus(intent.status))}</Badge>{intent.approvalSnapshotId && <span className="text-muted-foreground">{t("Approval record")} #{intent.approvalSnapshotId} ⁜ {t("Expires")} {approvalExpiryLabel(intent.approvalExpiresAt, locale, t)}{intent.status === "expired" ? ` ⁜ ${statusLabel("expired")}` : ""}</span>}</div>)}</div></section>)}
          {!calendarGroups.size && <p className="py-8 text-center text-sm text-muted-foreground">{t("No calendar entries match this filter.")}</p>}
        </div> : null}
        {view === "list" && visibleIntents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("Publication intents")}</h3>
            <Table>
              <TableHeader><TableRow><TableHead>{t("Intent")}</TableHead><TableHead>{t("Account")}</TableHead><TableHead>{t("Status")}</TableHead><TableHead>{t("Requested")}</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{visibleIntents.map((intent) => (
                <TableRow key={intent.id}>
                  <TableCell className="max-w-[520px]"><div className="flex flex-col gap-1"><span className="font-medium">#{intent.id} ⁜ {t("Draft")} #{intent.draftId}</span><span className="truncate text-xs text-muted-foreground">{intent.text}</span>{intent.approvalSnapshotId && <span className="text-xs text-muted-foreground">{t("Approval record")} #{intent.approvalSnapshotId} ⁜ {t("Post")} ⁜ @{intent.accountHandle}</span>}{needsManualReview(intent.status) && <span className="text-xs text-destructive">{t("Outcome uncertain ⁜ inspect the remote state manually; resending is disabled.")}</span>}</div></TableCell>
                  <TableCell>@{intent.accountHandle}</TableCell>
                  <TableCell><Badge variant={variant(intentStatus(intent.status))}>{statusLabel(intentStatus(intent.status))}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(intent.requestedAt, locale)}{intent.approvalSnapshotId && <span className={intent.status === "expired" ? "block text-destructive" : "block text-muted-foreground"}>{intent.status === "expired" ? statusLabel("expired") : t("Approval expiry")} ⁜ {approvalExpiryLabel(intent.approvalExpiresAt, locale, t)}</span>}</TableCell>
                  <TableCell><div className="flex justify-end gap-2">
                    {intent.status === "pending_approval" && <Button size="sm" onClick={() => actOnIntent(intent.id, "approve")} disabled={pending !== 0}>{t("Approve")}</Button>}
                    {canCreateFreshApproval(intent.status) && <Button size="sm" onClick={() => renewApproval(intent.draftId, intent.accountId, "post")} disabled={pending !== 0}>{t("Create new approval")}</Button>}
                    {["pending_approval", "approved", "blocked"].includes(intent.status) && <Button size="icon" variant="outline" onClick={() => actOnIntent(intent.id, "cancel")} disabled={pending !== 0} aria-label={t("Cancel publication intent")}><Ban aria-hidden="true" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
        {view === "list" && visibleJobs.length === 0 && visibleIntents.length === 0 ? (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>{t("Queue is empty")}</EmptyTitle>
              <EmptyDescription>{t("Prepare content on the drafts page.")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={reload}>
                <RefreshCw data-icon="inline-start" aria-hidden="true" /> {t("Refresh")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : view === "list" && visibleJobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Job")}</TableHead>
                <TableHead>{t("Account")}</TableHead>
                <TableHead>{t("Action")}</TableHead>
                <TableHead>{t("Schedule")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Remote evidence")}</TableHead>
                <TableHead>{t("Attempts")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="max-w-[360px]">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">#{job.id} ⁜ {t("Draft")} #{job.draftId}</span>
                      {job.reason && <span className="truncate text-xs text-muted-foreground">{job.reason}</span>}
                    </div>
                  </TableCell>
                  <TableCell>@{job.accountHandle}</TableCell>
                  <TableCell><Badge variant="outline">{supportedAction(job.action) ? t(({ post: "Post", repost: "Repost", reply: "Reply" } as Record<string, string>)[job.action]) : t("Disabled action")}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(job.scheduledAt, locale)}</TableCell>
                  <TableCell><Badge variant={variant(job.status)}>{statusLabel(job.status)}</Badge></TableCell>
                  <TableCell className="text-xs">
                      {job.status === "confirmed" ? <span>{t("Confirmed")}{job.remoteUrl ? <> ⁜ <a className="underline" href={postViewUrl(job.remoteUrl)}>{t("View post")}</a></> : null}</span>
                      : needsManualReview(job.status) ? t("Outcome uncertain ⁜ remote verification needed; review manually")
                        : job.status === "expired" ? <>{t("Approval expired")} ⁜ {approvalExpiryLabel(job.approvalExpiresAt, locale, t)} ⁜ {t("Approval record")} #{job.approvalSnapshotId ?? "—"}<br /><span>{t("The approved content snapshot is unavailable. Review the draft before creating a new approval.")} <Link href={`/drafts?draft=${job.draftId}`} className="underline">{t("Open draft")}</Link></span></>
                        : job.receipt ? t("Request accepted ⁜ verification needed") : job.remoteWriteStartedAt ? t("Request sent ⁜ outcome not verified yet") : t("No remote operation yet")}
                    {job.approvalSnapshotId && job.status !== "expired" && <span className="block text-muted-foreground">{t("Approval record")} #{job.approvalSnapshotId} ⁜ {t("Expires")} {approvalExpiryLabel(job.approvalExpiresAt, locale, t)}</span>}
                    {job.reconciliationStatus && job.reconciliationStatus !== "not_started" ? <span className="block text-muted-foreground">{statusLabel(job.reconciliationStatus)}</span> : null}
                    {job.deadLetteredAt ? <span className="block text-destructive">DLQ ⁜ {time(job.deadLetteredAt, locale)}</span> : null}
                    {job.leaseUntil ? <span className="block text-muted-foreground">{t("Processing lease")} ⁜ {time(job.leaseUntil, locale)}</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{job.attempts}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {supportedAction(job.action) && ["queued", "failed"].includes(job.status) && (
                        <Button size="sm" onClick={() => run(job.id)} disabled={pending > 0}>
                          {pending === job.id ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden="true" />} {t("Run")}
                        </Button>
                      )}
                      {job.status === "queued" && (
                        <Button size="icon" variant="outline" onClick={() => cancel(job.id)} disabled={pending > 0} aria-label={t("Cancel")}>
                          {pending === job.id ? <Spinner /> : <Ban aria-hidden="true" />}
                        </Button>
                      )}
                      {supportedAction(job.action) && canRetryJob(job.status) && (
                        <Button size="icon" variant="outline" onClick={() => retry(job.id)} disabled={pending > 0} aria-label={t("Retry job")}>
                          {pending === job.id ? <Spinner /> : <RotateCcw aria-hidden="true" />}
                        </Button>
                      )}
                      {supportedAction(job.action) && canCreateFreshApproval(job.status) && job.accountId !== null && <Button size="sm" variant="outline" onClick={() => renewApproval(job.draftId, job.accountId, job.action)} disabled={pending !== 0}>{t("Create new approval")}</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
