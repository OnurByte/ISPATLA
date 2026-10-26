"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { AutomationLog, AutomationTaskId, AutomationTaskSchedule } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useUiText } from "@/i18n/ui-client";

type Runtime = { owner: "none" | "worker" | "web"; heartbeatAt: number | null; healthy: boolean; lagSeconds: number | null };
type AccountAutomation = { accountId: number; handle: string; displayName: string; enabled: boolean; connected: boolean; postMode: string };
type State = { runtime: Runtime; accountAutomation: AccountAutomation[] };
function time(value: number, locale: string, t: (message: string) => string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(value * 1000) : t("Has not run yet");
}

function localDate(value: number) {
  const date = new Date(value * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const taskNames: Record<AutomationTaskId, { name: string; detail: string }> = {
  monitor_engine: { name: "Adaptive monitor engine", detail: "Scans account, keyword, query, and conversation targets within budget" },
  source_scan: { name: "Automated scan", detail: "FxTwitter intake, source scoring, opportunities, and publish gate" },
  source_liveness: { name: "Source liveness", detail: "Cleans up profile 404s and identity mismatches" },
  queue_worker: { name: "Due queue worker", detail: "Runs approved official 𝕏 API jobs" },
  reconciliation: { name: "FxTwitter reconciliation", detail: "Verifies pending transport results with publication evidence" },
  account_inference: { name: "Account topic suggestions", detail: "Suggests topics from connected 𝕏 accounts’ own profiles and posts" },
};

export function AutomationSettings({ initial, schedules: initialSchedules, logs: initialLogs, canManageSchedules }: { initial: State; schedules: AutomationTaskSchedule[]; logs: AutomationLog[]; canManageSchedules: boolean }) {
  const { t, locale } = useUiText();
  const [state, setState] = useState<State>(initial);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [logs, setLogs] = useState(initialLogs);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setPending(true);
    try {
      const response = await fetch("/api/settings/automation", { cache: "no-store" });
      if (!response.ok) throw new Error(t("Could not load automation status."));
      const body = await response.json() as State & { schedules: AutomationTaskSchedule[]; logs: AutomationLog[] };
      setState(body); setSchedules(body.schedules); setLogs(body.logs);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? t(error.message) : t("Could not load automation status."));
    } finally { if (!quiet) setPending(false); }
  }, [t]);

  useEffect(() => {
    const timer = window.setInterval(() => { void load(true); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function saveSchedule(schedule: AutomationTaskSchedule) {
    setPending(true);
    try {
      const response = await fetch("/api/settings/automation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_schedule", task: schedule.id, enabled: schedule.enabled, intervalSeconds: schedule.intervalSeconds, nextRunAt: schedule.nextRunAt }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || t("Could not save the schedule."));
      setSchedules(body.schedules); setLogs(body.logs); setMessage(t("{task} schedule saved.", { task: t(taskNames[schedule.id].name) }));
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("Could not save the schedule."));
    } finally { setPending(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Activity aria-hidden="true" />
            <div>
              <CardTitle>{t("Worker status")}</CardTitle>
              <CardDescription>{t("This indicator tracks the worker heartbeat recorded in the database. Enabled schedules do not mean the worker is running.")}</CardDescription>
            </div>
          </div>
          <Badge variant={state.runtime.healthy ? "default" : "destructive"}>{state.runtime.healthy ? t("Running") : t("No response")}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {state.runtime.healthy
              ? t("{worker} active ⁜ last heartbeat {time}{lag}", { worker: t(state.runtime.owner === "worker" ? "Background worker" : "Web worker"), time: time(state.runtime.heartbeatAt || 0, locale, t), lag: state.runtime.lagSeconds !== null ? ` ⁜ ${t("{seconds} sec ago", { seconds: new Intl.NumberFormat(locale).format(state.runtime.lagSeconds) })}` : "" })
              : t("No active worker heartbeat. Scheduled plans are saved, but the background worker must be online to run them.")}
          </p>
          <Button variant="outline" onClick={() => { void load(); }} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} {t("Refresh")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("Connected account permissions")}</CardTitle><CardDescription>{t("Each account’s own publishing permission and connection status.")}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state.accountAutomation.length ? state.accountAutomation.map((account) => <div key={account.accountId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><div className="font-medium">{account.displayName || `@${account.handle}`} <span className="text-muted-foreground">@{account.handle}</span></div><div className="text-xs text-muted-foreground">{account.enabled ? t("Monitoring enabled") : t("Account disabled")} ⁜ {account.connected ? t("𝕏 connected") : t("𝕏 not connected")}</div></div><Badge variant={account.connected && account.enabled ? "outline" : "secondary"}>{t("Publishing permission: {mode}", { mode: t(account.postMode === "auto" ? "Automatic" : account.postMode === "assist" ? "Approval required" : "Off") })}</Badge></div>) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("No 𝕏 accounts are connected yet. Manage account connections and publishing permissions in the Accounts section.")}</div>}
        </CardContent>
      </Card>

      {canManageSchedules ? <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Scheduled automated tasks")}</CardTitle>
          <CardDescription>{t("This shows cron and scheduler task plans, not post records.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="grid gap-3 rounded-lg border p-3 text-sm lg:grid-cols-[1fr_1.3fr_110px_180px_auto] lg:items-center">
              <div><div className="font-medium">{t(taskNames[schedule.id].name)}</div><div className="text-xs text-muted-foreground">{t(taskNames[schedule.id].detail)}</div></div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, enabled: event.target.checked } : item))} /> {t("Active")}</label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">{schedule.id === "monitor_engine" ? t("sec") : t("min")} <input className="h-8 w-20 rounded-md border bg-transparent px-2" type="number" min={schedule.id === "monitor_engine" ? 15 : 1} max={schedule.id === "monitor_engine" ? 3600 : 43200} value={schedule.id === "monitor_engine" ? schedule.intervalSeconds : Math.max(1, Math.round(schedule.intervalSeconds / 60))} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, intervalSeconds: schedule.id === "monitor_engine" ? Math.max(15, Number(event.target.value || 15)) : Math.max(60, Number(event.target.value || 1) * 60) } : item))} /></label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("Next run")}<input className="h-8 rounded-md border bg-transparent px-2" type="datetime-local" value={localDate(schedule.nextRunAt)} onChange={(event) => setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, nextRunAt: Math.floor(new Date(event.target.value).getTime() / 1000) } : item))} /></label>
              <Button size="sm" onClick={() => saveSchedule(schedule)} disabled={pending}>{t("Save")}</Button>
              <div className="text-xs text-muted-foreground lg:col-span-5">{t("Last run")}: {time(schedule.lastRunAt, locale, t)} ⁜ {t(schedule.lastStatus)}</div>
            </div>
          ))}
          <Alert><AlertDescription>{t("Plans run only while the background worker connected to this database is running. Results appear in the latest run.")}</AlertDescription></Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("Automation log")}</CardTitle><CardDescription>{t("Scan, liveness, queue, and reconciliation results. Secret values are redacted.")}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {logs.length ? logs.map((log) => {
            const details = Object.entries(log.details).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value));
            return <div key={log.id} className="rounded-lg border p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{t(taskNames[log.taskId]?.name || log.taskId)} ⁜ {t(log.status)}</span><span className="text-muted-foreground">{time(log.startedAt, locale, t)}{log.finishedAt ? ` → ${time(log.finishedAt, locale, t)}` : ""}</span></div>{log.message && <p className="mt-2 text-muted-foreground">{t(log.message)}</p>}{details.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{details.map(([key, value]) => <div key={key} className="rounded-md bg-muted/50 px-2 py-1"><dt className="text-muted-foreground">{key}</dt><dd className="font-medium">{String(value)}</dd></div>)}</dl>}</div>;
          }) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("No automation runs have been recorded yet.")}</div>}
        </CardContent>
      </Card>
      </> : <Card><CardHeader><CardTitle>{t("Task schedules")}</CardTitle><CardDescription>{t("The worker’s global schedule is managed by the operator only.")}</CardDescription></CardHeader></Card>}

      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
    </div>
  );
}
