"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { AutomationLog, AutomationTaskId, AutomationTaskSchedule } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Runtime = { owner: "none" | "worker" | "web"; heartbeatAt: number | null; healthy: boolean; lagSeconds: number | null };
type AccountAutomation = { accountId: number; handle: string; displayName: string; enabled: boolean; connected: boolean; postMode: string };
type State = { runtime: Runtime; accountAutomation: AccountAutomation[] };
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
  queue_worker: { name: "Due queue worker", detail: "Onaylanmış resmi 𝕏 API işlerini çalıştırır" },
  reconciliation: { name: "FxTwitter reconciliation", detail: "Pending transport sonuçlarını yayın kanıtıyla doğrular" },
  account_inference: { name: "Hesap konu önerileri", detail: "Bağlı 𝕏 hesaplarının kendi profil ve gönderilerinden konu önerisi hazırlar" },
};

export function AutomationSettings({ initial, schedules: initialSchedules, logs: initialLogs, canManageSchedules }: { initial: State; schedules: AutomationTaskSchedule[]; logs: AutomationLog[]; canManageSchedules: boolean }) {
  const [state, setState] = useState<State>(initial);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [logs, setLogs] = useState(initialLogs);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setPending(true);
    try {
      const response = await fetch("/api/settings/automation", { cache: "no-store" });
      if (!response.ok) throw new Error("Otomasyon durumu alınamadı.");
      const body = await response.json() as State & { schedules: AutomationTaskSchedule[]; logs: AutomationLog[] };
      setState(body); setSchedules(body.schedules); setLogs(body.logs);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Otomasyon durumu alınamadı.");
    } finally { if (!quiet) setPending(false); }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function saveSchedule(schedule: AutomationTaskSchedule) {
    setPending(true);
    try {
      const response = await fetch("/api/settings/automation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_schedule", task: schedule.id, enabled: schedule.enabled, intervalSeconds: schedule.intervalSeconds, nextRunAt: schedule.nextRunAt }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Plan kaydedilemedi.");
      setSchedules(body.schedules); setLogs(body.logs); setMessage(`${taskNames[schedule.id].name} planı kaydedildi.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan kaydedilemedi.");
    } finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Activity aria-hidden="true" />
            <div>
              <CardTitle>Çalıştırıcı durumu</CardTitle>
              <CardDescription>Bu gösterge veritabanındaki gerçek worker kalp atışını izler; planların açık olması worker’ın çalıştığı anlamına gelmez.</CardDescription>
            </div>
          </div>
          <Badge variant={state.runtime.healthy ? "default" : "destructive"}>{state.runtime.healthy ? "çalışıyor" : "yanıt yok"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {state.runtime.healthy
              ? `${state.runtime.owner === "worker" ? "Arka plan worker’ı" : "Web worker"} etkin · son kalp atışı ${time(state.runtime.heartbeatAt || 0)}${state.runtime.lagSeconds !== null ? ` · ${state.runtime.lagSeconds} sn önce` : ""}`
              : "Aktif worker kalp atışı yok. Zamanlanmış planlar kaydedilir; çalışması için arka plan worker’ı çevrimiçi olmalıdır."}
          </p>
          <Button variant="outline" onClick={() => { void load(); }} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} Yenile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bağlı hesapların izinleri</CardTitle><CardDescription>Bu hesapların kendi yayın izni ve bağlantı durumu.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state.accountAutomation.length ? state.accountAutomation.map((account) => <div key={account.accountId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><div className="font-medium">{account.displayName || `@${account.handle}`} <span className="text-muted-foreground">@{account.handle}</span></div><div className="text-xs text-muted-foreground">{account.enabled ? "İzleme açık" : "Hesap devre dışı"} · {account.connected ? "X bağlantısı aktif" : "X bağlantısı yok"}</div></div><Badge variant={account.connected && account.enabled ? "outline" : "secondary"}>Yayın izni: {account.postMode === "auto" ? "Otomatik" : account.postMode === "assist" ? "Onaylı" : "Kapalı"}</Badge></div>) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Henüz bağlı X hesabı yok. Hesap bağlantısı ve yayın izinlerini Hesaplar bölümünden yönetebilirsin.</div>}
        </CardContent>
      </Card>

      {canManageSchedules ? <>
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
          <Alert><AlertDescription>Planlar yalnızca bu veritabanına bağlı arka plan worker’ı çalışırken yürütülür. Sonuçlar son çalışma alanında görünür.</AlertDescription></Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Automation log</CardTitle><CardDescription>Scan, liveness, queue ve reconciliation sonuçları; secret değerleri redakte edilir.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {logs.length ? logs.map((log) => {
            const details = Object.entries(log.details).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value));
            return <div key={log.id} className="rounded-lg border p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{taskNames[log.taskId]?.name || log.taskId} · {log.status}</span><span className="text-muted-foreground">{time(log.startedAt)}{log.finishedAt ? ` → ${time(log.finishedAt)}` : ""}</span></div>{log.message && <p className="mt-2 text-muted-foreground">{log.message}</p>}{details.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{details.map(([key, value]) => <div key={key} className="rounded-md bg-muted/50 px-2 py-1"><dt className="text-muted-foreground">{key}</dt><dd className="font-medium">{String(value)}</dd></div>)}</dl>}</div>;
          }) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Henüz otomasyon çalışması kaydedilmemiş.</div>}
        </CardContent>
      </Card>
      </> : <Card><CardHeader><CardTitle>Görev planları</CardTitle><CardDescription>Worker’ın global çalışma planı yalnızca operatör tarafından yönetilir.</CardDescription></CardHeader></Card>}

      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
    </div>
  );
}
