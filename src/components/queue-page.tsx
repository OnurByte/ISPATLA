"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Play, RefreshCw, RotateCcw } from "lucide-react";
import type { AutomationJob, PublicationIntent } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function variant(status: string): "default" | "secondary" | "destructive" | "outline" {
  return status === "submitted" || status === "confirmed" ? "default" : status === "blocked" || status === "failed" || status === "dead_letter" ? "destructive" : status === "queued" ? "secondary" : "outline";
}

function time(value: number) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(value * 1000) : "—";
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

export function approvalExpiryLabel(expiresAt: number | null): string {
  return expiresAt ? time(expiresAt) : "son kullanma zamanı API'de yok";
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
    setMessage(response.ok ? action === "approve" ? "Yayın niyeti onaylandı; resmi 𝕏 API worker işleyecek." : "Yayın niyeti iptal edildi." : body.error || "Yayın niyeti güncellenemedi.");
    await reload();
  }

  async function renewApproval(draftId: number, accountId: number | null, action: string) {
    if (!accountId) return setMessage("Yeni onay için API yanıtında hesap kimliği bulunamadı.");
    setPending(-draftId);
    try {
      const response = await fetch(`/api/drafts/${draftId}/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, action }),
      });
      const body = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Yeni onay oluşturuldu; önceki süresi dolmuş onay yenilenmedi." : body.error || "Yeni onay oluşturulamadı.");
      if (response.ok) await reload();
    } catch {
      setMessage("Yeni onay isteği tamamlanamadı; durumu yenileyip kontrol et.");
    } finally {
      setPending(0);
    }
  }

  async function run(id: number) {
    setPending(id);
    const response = await fetch(`/api/queue/${id}/run`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(0);
    setMessage(response.ok ? (body.ok ? "𝕏 isteği kabul etti; uzaktaki yayın kanıtı bekleniyor." : body.reason || "Job bloklandı.") : body.error || "Job çalışmadı.");
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
          <CardTitle>Automation queue</CardTitle>
          <CardDescription>Receipt başarı değildir; confirmed yalnız reconciliation kanıtından sonra gelir.</CardDescription>
        </div>
        <Button variant="outline" onClick={reload} disabled={pending > 0}>
          <RefreshCw data-icon="inline-start" aria-hidden="true" /> Yenile
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="queue-status" className="text-sm font-medium">Durum</label>
          <select id="queue-status" className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => syncUrl(event.target.value, view)}>
          <option value="all">Tümü</option><option value="pending_approval">Onay bekliyor</option><option value="approved">Onaylandı</option><option value="dispatching">Gönderiliyor</option><option value="queued">Kuyrukta</option><option value="blocked">Engellendi</option><option value="failed">Başarısız</option><option value="dead_letter">DLQ</option><option value="pending_reconciliation">Doğrulama bekliyor</option><option value="reconciliation_required">Uzlaştırma gerekli</option><option value="confirmed">Doğrulandı</option><option value="cancelled">İptal</option><option value="expired">Onay süresi doldu</option>
          </select>
          <div className="ml-auto flex gap-2"><Button size="sm" variant={view === "list" ? "secondary" : "outline"} onClick={() => syncUrl(statusFilter, "list")}>Liste</Button><Button size="sm" variant={view === "calendar" ? "secondary" : "outline"} onClick={() => syncUrl(statusFilter, "calendar")}>Takvim</Button></div>
        </div>
        {view === "calendar" ? <div className="flex flex-col gap-3" aria-label="Kuyruk takvimi">
          {[...calendarGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, group]) => <section key={day} className="rounded-lg border p-4"><h3 className="mb-3 text-sm font-semibold">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "full", timeZone: "Europe/Istanbul" }).format(new Date(`${day}T12:00:00+03:00`))}</h3><div className="flex flex-col gap-2">{group.jobs.map((job) => <div key={`job-${job.id}`} className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">{time(job.scheduledAt)}</Badge><span>Job #{job.id} · draft #{job.draftId}</span><Badge variant={variant(job.status)}>{job.status}</Badge>{job.approvalSnapshotId && <span className="text-muted-foreground">Onay kaydı #{job.approvalSnapshotId} · son tarih {approvalExpiryLabel(job.approvalExpiresAt)}{job.status === "expired" ? " · süresi doldu" : ""}</span>}{job.reason && <span className="text-muted-foreground">{job.reason}</span>}</div>)}{group.intents.map((intent) => <div key={`intent-${intent.id}`} className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline">{time(intent.requestedAt)}</Badge><span>Yayın intent #{intent.id} · @{intent.accountHandle}</span><Badge variant={variant(intentStatus(intent.status))}>{intentStatus(intent.status)}</Badge>{intent.approvalSnapshotId && <span className="text-muted-foreground">Onay kaydı #{intent.approvalSnapshotId} · son tarih {approvalExpiryLabel(intent.approvalExpiresAt)}{intent.status === "expired" ? " · süresi doldu" : ""}</span>}</div>)}</div></section>)}
          {!calendarGroups.size && <p className="py-8 text-center text-sm text-muted-foreground">Bu filtrede takvim kaydı yok.</p>}
        </div> : null}
        {view === "list" && visibleIntents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">PublicationIntent</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Intent</TableHead><TableHead>Hesap</TableHead><TableHead>Durum</TableHead><TableHead>İstenen</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{visibleIntents.map((intent) => (
                <TableRow key={intent.id}>
                  <TableCell className="max-w-[520px]"><div className="flex flex-col gap-1"><span className="font-medium">#{intent.id} · draft #{intent.draftId}</span><span className="truncate text-xs text-muted-foreground">{intent.text}</span>{intent.approvalSnapshotId && <span className="text-xs text-muted-foreground">Onay kaydı #{intent.approvalSnapshotId} · post · @{intent.accountHandle}</span>}{needsManualReview(intent.status) && <span className="text-xs text-destructive">Sonuç belirsiz · uzaktaki durumu elle incele; yeniden gönderme kapalı.</span>}</div></TableCell>
                  <TableCell>@{intent.accountHandle}</TableCell>
                  <TableCell><Badge variant={variant(intentStatus(intent.status))}>{intentStatus(intent.status)}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(intent.requestedAt)}{intent.approvalSnapshotId && <span className={intent.status === "expired" ? "block text-destructive" : "block text-muted-foreground"}>{intent.status === "expired" ? "Onay süresi doldu" : "Onay son tarihi"} · {approvalExpiryLabel(intent.approvalExpiresAt)}</span>}</TableCell>
                  <TableCell><div className="flex justify-end gap-2">
                    {intent.status === "pending_approval" && <Button size="sm" onClick={() => actOnIntent(intent.id, "approve")} disabled={pending !== 0}>Onayla</Button>}
                    {canCreateFreshApproval(intent.status) && <Button size="sm" onClick={() => renewApproval(intent.draftId, intent.accountId, "post")} disabled={pending !== 0}>Yeni onay oluştur</Button>}
                    {["pending_approval", "approved", "blocked"].includes(intent.status) && <Button size="icon" variant="outline" onClick={() => actOnIntent(intent.id, "cancel")} disabled={pending !== 0} aria-label="Yayın niyetini iptal et"><Ban aria-hidden="true" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
        {view === "list" && visibleJobs.length === 0 && visibleIntents.length === 0 ? (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyTitle>Kuyruk boş</EmptyTitle>
              <EmptyDescription>Draft stüdyosundan bir içerik kuyruğa al.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={reload}>
                <RefreshCw data-icon="inline-start" aria-hidden="true" /> Yenile
              </Button>
            </EmptyContent>
          </Empty>
        ) : view === "list" && visibleJobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Hesap</TableHead>
                <TableHead>Aksiyon</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Uzak kanıt</TableHead>
                <TableHead>Deneme</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="max-w-[360px]">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">#{job.id} · draft #{job.draftId}</span>
                      {job.reason && <span className="truncate text-xs text-muted-foreground">{job.reason}</span>}
                    </div>
                  </TableCell>
                  <TableCell>@{job.accountHandle}</TableCell>
                  <TableCell><Badge variant="outline">{supportedAction(job.action) ? job.action : "devre dışı eylem"}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(job.scheduledAt)}</TableCell>
                  <TableCell><Badge variant={variant(job.status)}>{job.status}</Badge></TableCell>
                  <TableCell className="text-xs">
                      {job.status === "confirmed" ? <span>Doğrulandı{job.remoteUrl ? <> · <a className="underline" href={job.remoteUrl} target="_blank" rel="noreferrer">𝕏’te aç</a></> : null}</span>
                      : needsManualReview(job.status) ? "Sonuç belirsiz · uzaktaki doğrulama gerekli; elle incele"
                        : job.status === "expired" ? <>Onay süresi doldu · {approvalExpiryLabel(job.approvalExpiresAt)} · onay kaydı #{job.approvalSnapshotId ?? "—"}<br /><span>Onaylanan içerik özeti görüntülenemiyor; yeni onaydan önce taslağı incele. <Link href={`/app/drafts?draft=${job.draftId}`} className="underline">Taslağı aç</Link></span></>
                        : job.receipt ? "İstek kabul edildi · doğrulama gerekli" : job.remoteWriteStartedAt ? "İstek gönderildi · sonuç henüz doğrulanmadı" : "Henüz uzak işlem yok"}
                    {job.approvalSnapshotId && job.status !== "expired" && <span className="block text-muted-foreground">Onay kaydı #{job.approvalSnapshotId} · son tarih {approvalExpiryLabel(job.approvalExpiresAt)}</span>}
                    {job.reconciliationStatus && job.reconciliationStatus !== "not_started" ? <span className="block text-muted-foreground">{job.reconciliationStatus}</span> : null}
                    {job.deadLetteredAt ? <span className="block text-destructive">DLQ · {time(job.deadLetteredAt)}</span> : null}
                    {job.leaseUntil ? <span className="block text-muted-foreground">İşlem lease’i · {time(job.leaseUntil)}</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{job.attempts}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {supportedAction(job.action) && ["queued", "failed"].includes(job.status) && (
                        <Button size="sm" onClick={() => run(job.id)} disabled={pending > 0}>
                          {pending === job.id ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden="true" />} Çalıştır
                        </Button>
                      )}
                      {job.status === "queued" && (
                        <Button size="icon" variant="outline" onClick={() => cancel(job.id)} disabled={pending > 0} aria-label="İptal">
                          {pending === job.id ? <Spinner /> : <Ban aria-hidden="true" />}
                        </Button>
                      )}
                      {supportedAction(job.action) && canRetryJob(job.status) && (
                        <Button size="icon" variant="outline" onClick={() => retry(job.id)} disabled={pending > 0} aria-label="Tekrar kuyruğa al">
                          {pending === job.id ? <Spinner /> : <RotateCcw aria-hidden="true" />}
                        </Button>
                      )}
                      {supportedAction(job.action) && canCreateFreshApproval(job.status) && job.accountId !== null && <Button size="sm" variant="outline" onClick={() => renewApproval(job.draftId, job.accountId, job.action)} disabled={pending !== 0}>Yeni onay oluştur</Button>}
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
