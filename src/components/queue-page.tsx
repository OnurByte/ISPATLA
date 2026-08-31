"use client";

import { useState } from "react";
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
  return status === "submitted" || status === "confirmed" ? "default" : status === "blocked" || status === "failed" ? "destructive" : status === "queued" ? "secondary" : "outline";
}

function time(value: number) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(value * 1000) : "—";
}

export function QueuePage({ initial, initialIntents }: { initial: AutomationJob[]; initialIntents: PublicationIntent[] }) {
  const [jobs, setJobs] = useState(initial);
  const [intents, setIntents] = useState(initialIntents);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(0);

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
    setMessage(response.ok ? action === "approve" ? "Yayın niyeti onaylandı; worker x-use’a gönderecek." : "Yayın niyeti iptal edildi." : body.error || "Yayın niyeti güncellenemedi.");
    await reload();
  }

  async function run(id: number) {
    setPending(id);
    const response = await fetch(`/api/queue/${id}/run`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(0);
    setMessage(response.ok ? (body.ok ? "x-use job gönderildi; reconciliation bekleniyor." : body.reason || "Job bloklandı.") : body.error || "Job çalışmadı.");
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

  async function sync(id: number) {
    setPending(id);
    const response = await fetch(`/api/queue/${id}/xuse/sync`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(0);
    setMessage(response.ok ? `x-use: ${body.remote?.status || "bulunamadı"}` : body.error || "x-use queue yenilenemedi.");
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
        {intents.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">PublicationIntent</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Intent</TableHead><TableHead>Hesap</TableHead><TableHead>Durum</TableHead><TableHead>İstenen</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{intents.map((intent) => (
                <TableRow key={intent.id}>
                  <TableCell className="max-w-[520px]"><div className="flex flex-col gap-1"><span className="font-medium">#{intent.id} · draft #{intent.draftId}</span><span className="truncate text-xs text-muted-foreground">{intent.text}</span></div></TableCell>
                  <TableCell>@{intent.accountHandle}</TableCell>
                  <TableCell><Badge variant={variant(intent.status)}>{intent.status}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(intent.requestedAt)}</TableCell>
                  <TableCell><div className="flex justify-end gap-2">
                    {intent.status === "pending_approval" && <Button size="sm" onClick={() => actOnIntent(intent.id, "approve")} disabled={pending !== 0}>Onayla</Button>}
                    {["pending_approval", "approved", "blocked"].includes(intent.status) && <Button size="icon" variant="outline" onClick={() => actOnIntent(intent.id, "cancel")} disabled={pending !== 0} aria-label="Yayın niyetini iptal et"><Ban aria-hidden="true" /></Button>}
                  </div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
        {jobs.length === 0 && intents.length === 0 ? (
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
        ) : jobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Hesap</TableHead>
                <TableHead>Aksiyon</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>x-use</TableHead>
                <TableHead>Deneme</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="max-w-[360px]">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">#{job.id} · draft #{job.draftId}</span>
                      {job.reason && <span className="truncate text-xs text-muted-foreground">{job.reason}</span>}
                    </div>
                  </TableCell>
                  <TableCell>@{job.accountHandle}</TableCell>
                  <TableCell><Badge variant="outline">{job.action}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{time(job.scheduledAt)}</TableCell>
                  <TableCell><Badge variant={variant(job.status)}>{job.status}</Badge></TableCell>
                  <TableCell>{job.xuseQueueId ? <span className="text-xs">{job.xuseStatus || "bilinmiyor"}</span> : "—"}</TableCell>
                  <TableCell className="tabular-nums">{job.attempts}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {["queued", "failed"].includes(job.status) && (
                        <Button size="sm" onClick={() => run(job.id)} disabled={pending > 0}>
                          {pending === job.id ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden="true" />} Çalıştır
                        </Button>
                      )}
                      {job.status === "queued" && (
                        <Button size="icon" variant="outline" onClick={() => cancel(job.id)} disabled={pending > 0} aria-label="İptal">
                          {pending === job.id ? <Spinner /> : <Ban aria-hidden="true" />}
                        </Button>
                      )}
                      {job.status === "blocked" && (
                        <Button size="icon" variant="outline" onClick={() => retry(job.id)} disabled={pending > 0} aria-label="Tekrar kuyruğa al">
                          {pending === job.id ? <Spinner /> : <RotateCcw aria-hidden="true" />}
                        </Button>
                      )}
                      {job.xuseQueueId && <Button size="icon" variant="outline" onClick={() => sync(job.id)} disabled={pending > 0} aria-label="x-use durumunu yenile"><RefreshCw aria-hidden="true" /></Button>}
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
