"use client";

import { useState } from "react";
import { Bot, CircleStop, Play, RefreshCw } from "lucide-react";
import type { AutomationLog, AutomationTaskId, AutomationTaskSchedule } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

type State = { paused: boolean; xuse: { available: boolean; bin: string; doctor: string; actions: Record<string, boolean>; config: { settings: string; accounts: string; settingsExists: boolean; accountsExists: boolean }; reason?: string } };
function time(value: number) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(value * 1000) : "Henüz çalışmadı";
}

function localDate(value: number) {
  const date = new Date(value * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const taskNames: Record<AutomationTaskId, { name: string; detail: string }> = {
  monitor_engine: { name: "Adaptive monitor engine", detail: "Hesap, keyword, sorgu ve conversation hedeflerini bütçeli tarar" },
  source_scan: { name: "Otomatik scan", detail: "FxTwitter intake, kaynak skoru, fırsat ve publish gate" },
  source_liveness: { name: "Ölü kaynak / liveness", detail: "Profil 404 ve kimlik uyuşmazlıklarını temizler" },
  queue_worker: { name: "Due queue worker", detail: "Zamanı gelen x-use işlerini çalıştırır" },
  reconciliation: { name: "FxTwitter reconciliation", detail: "Pending transport sonuçlarını yayın kanıtıyla doğrular" },
};

export function AutomationSettings({ initial, schedules: initialSchedules, logs: initialLogs }: { initial: State; schedules: AutomationTaskSchedule[]; logs: AutomationLog[] }) {
  const [state, setState] = useState<State>(initial);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [logs, setLogs] = useState(initialLogs);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    setPending(true);
    const response = await fetch("/api/settings/automation", { cache: "no-store" });
    const body = await response.json() as State & { schedules: AutomationTaskSchedule[]; logs: AutomationLog[] };
    setState(body); setSchedules(body.schedules); setLogs(body.logs);
    setPending(false);
  }

  async function saveSchedule(schedule: AutomationTaskSchedule) {
    setPending(true);
    const response = await fetch("/api/settings/automation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_schedule", task: schedule.id, enabled: schedule.enabled, intervalSeconds: schedule.intervalSeconds, nextRunAt: schedule.nextRunAt }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setSchedules(body.schedules); setLogs(body.logs); setMessage(`${taskNames[schedule.id].name} planı kaydedildi.`); }
    else setMessage(body.error || "Plan kaydedilemedi.");
    setPending(false);
  }

  async function setPaused(paused: boolean) {
    setPending(true);
    const response = await fetch("/api/settings/automation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Otomasyon ${paused ? "durduruldu" : "devam ediyor"}.` : body.error || "Ayar değişmedi.");
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bot aria-hidden="true" />
            <div>
              <CardTitle>Global kill switch</CardTitle>
              <CardDescription>Scheduler ve yeni automation akışını tek dokunuşla durdur.</CardDescription>
            </div>
          </div>
          <Badge variant={state.paused ? "destructive" : "default"}>{state.paused ? "paused" : "running"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => setPaused(false)} disabled={!state.paused || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden="true" />} Devam ettir
          </Button>
          <Button variant="destructive" onClick={() => setPaused(true)} disabled={state.paused || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" aria-hidden="true" />} Durdur
          </Button>
          <Button variant="outline" onClick={load} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} Yenile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>x-use capability</CardTitle>
          <CardDescription>{state.xuse.bin} · doctor sonucu gerçek runtime’dan okunur.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={state.xuse.available ? "default" : "destructive"}>{state.xuse.available ? "CLI hazır" : "CLI yok"}</Badge>
            <Badge variant={state.xuse.doctor === "ok" ? "default" : state.xuse.doctor === "unavailable" ? "outline" : "destructive"}>doctor: {state.xuse.doctor}</Badge>
            <Badge variant={state.xuse.config.settingsExists ? "secondary" : "destructive"}>settings.json: {state.xuse.config.settingsExists ? "hazır" : "eksik"}</Badge>
            <Badge variant={state.xuse.config.accountsExists ? "secondary" : "destructive"}>accounts.json: {state.xuse.config.accountsExists ? "hazır" : "eksik"}</Badge>
          </div>
          <Separator />
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(state.xuse.actions).map(([action, enabled]) => (
              <div key={action} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{action}</span>
                <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "detected" : "—"}</Badge>
              </div>
            ))}
          </div>
          {state.xuse.reason && <Alert variant="destructive"><AlertDescription>{state.xuse.reason}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planlı otomatik görevler</CardTitle>
          <CardDescription>Post kayıtları burada değil; cron/scheduler görevlerinin çalışma planı burada görünür.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="grid gap-3 rounded-lg border p-3 text-sm lg:grid-cols-[1fr_1.3fr_110px_180px_auto] lg:items-center">
              <div><div className="font-medium">{taskNames[schedule.id].name}</div><div className="text-xs text-muted-foreground">{taskNames[schedule.id].detail}</div></div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, enabled: event.target.checked } : item))} /> aktif</label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">{schedule.id === "monitor_engine" ? "sn" : "dk"} <input className="h-8 w-20 rounded-md border bg-transparent px-2" type="number" min={schedule.id === "monitor_engine" ? 15 : 1} max={schedule.id === "monitor_engine" ? 3600 : 43200} value={schedule.id === "monitor_engine" ? schedule.intervalSeconds : Math.max(1, Math.round(schedule.intervalSeconds / 60))} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, intervalSeconds: schedule.id === "monitor_engine" ? Math.max(15, Number(event.target.value || 15)) : Math.max(60, Number(event.target.value || 1) * 60) } : item))} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Sonraki çalışma<input className="h-8 rounded-md border bg-transparent px-2" type="datetime-local" value={localDate(schedule.nextRunAt)} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, nextRunAt: Math.floor(new Date(event.target.value).getTime() / 1000) } : item))} /></label>
              <Button size="sm" onClick={() => saveSchedule(schedule)} disabled={pending}>Kaydet</Button>
              <div className="text-xs text-muted-foreground lg:col-span-5">Son: {time(schedule.lastRunAt)} · {schedule.lastStatus}</div>
            </div>
          ))}
          <Alert><AlertDescription>Çalıştırıcı: <code>bun run automation:worker</code>. Uzun çalışan worker 15 saniyelik burst hedeflerini ve diğer planlı görevleri aynı SQLite kilidi altında yürütür.</AlertDescription></Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automation log</CardTitle><CardDescription>Scan, liveness, queue, reconciliation ve x-use doctor sonuçları; secret değerleri redakte edilir.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {logs.length ? logs.map((log) => <div key={log.id} className="rounded-lg border p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{log.taskId} · {log.status}</span><span className="text-muted-foreground">{time(log.startedAt)}{log.finishedAt ? ` → ${time(log.finishedAt)}` : ""}</span></div><pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{log.message || JSON.stringify(log.details)}</pre></div>) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Henüz otomasyon logu yok.</div>}
        </CardContent>
      </Card>

      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
    </div>
  );
}
