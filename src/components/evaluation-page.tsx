"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUiText } from "@/i18n/ui-client";

type PredictionRow = {
  id: string; accountId: string; candidateId: string; modelKey: string; split: "train" | "calibration" | "holdout";
  rawScore: number; calibratedProbability: number | null; decision: string; reason: string; riskTier: string;
  selectionPropensity: number | null; createdAt: number; resolveBy: number; due: boolean; label: string | null;
  outcomes: Array<{ observedAt: number; capturedAt: number; metrics: Record<string, number | null>; censored: string[]; source: string }>;
};
type Data = {
  accounts: Array<{ id: string; handle: string; displayName: string }>;
  selectedAccountId: string | null; selectedModelKey: string; models: string[]; predictions: PredictionRow[];
  historyLimit: number;
  calibration: null | { status: "calibrated" | "insufficient"; sampleCount: number; mapping: Array<{ upperScore: number; probability: number; count: number }> };
  replays: Array<{ id: string; createdAt: number; sampleCount: number; brier: number | null; logLoss: number | null; ece: number | null }>;
};

const labelOptions = ["hit", "miss", "late_hit", "wrong_account", "wrong_format", "policy_block", "publisher_failure", "cannibalization"] as const;

function timestamp(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value * 1000); }
function outcomeText(row: PredictionRow, locale: string, t: (message: string, params?: Record<string, string | number>) => string) {
  if (!row.outcomes.length) return t("No observed outcome yet");
  const latest = row.outcomes[row.outcomes.length - 1];
  const metrics = Object.entries(latest.metrics).map(([name, value]) => `${name}: ${value === null ? t("Unknown") : new Intl.NumberFormat(locale).format(value)}`).join(" ⁜ ");
  const censored = latest.censored.length ? ` ⁜ ${t("Censored")}: ${latest.censored.join(", ")}` : "";
  return `${metrics}${censored} ⁜ ${timestamp(latest.observedAt, locale)}`;
}

export function EvaluationPage() {
  const { t, locale } = useUiText();
  const enumText: Record<string, string> = {
    hit: "Hit", miss: "Miss", late_hit: "Late hit", wrong_account: "Wrong account", wrong_format: "Wrong format", policy_block: "Policy block", publisher_failure: "Publisher failure", cannibalization: "Cannibalization",
    train: "Training", calibration: "Calibration", holdout: "Holdout", calibrated: "Calibrated", insufficient: "Insufficient data", due: "Due for label",
    opportunity: "Opportunity", below_threshold: "Below threshold", expired: "Expired", not_eligible_evidence: "Ineligible evidence", processed: "Processed", sensitive: "Sensitive",
    low: "Low", medium: "Medium", high: "High", critical: "Critical", unknown: "Unknown",
  };
  const labelText = (value: string) => enumText[value] ? t(enumText[value]) : value;
  const [data, setData] = useState<Data | null>(null);
  const [accountId, setAccountId] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [labelFilter, setLabelFilter] = useState("due");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const initialLoad = useRef(false);

  const load = useCallback(async (nextAccount = accountId, nextModel = modelKey) => {
    setPending("load");
    try {
      const read = async (account: string, model: string) => {
        const query = new URLSearchParams();
        if (account) query.set("accountId", account);
        if (model) query.set("modelKey", model);
        const response = await fetch(`/api/evaluation?${query}`, { cache: "no-store" });
        const result = await response.json().catch(() => ({})) as Data & { error?: string };
        if (!response.ok) throw new Error(result.error ? t(result.error) : t("Could not load evaluation data (HTTP {status}).", { status: response.status }));
        return result;
      };
      let body = await read(nextAccount, nextModel);
      const selectedAccount = nextAccount || body.selectedAccountId || "";
      const selectedModel = nextModel || body.models[0] || "";
      if (selectedAccount && selectedModel && selectedModel !== nextModel) body = await read(selectedAccount, selectedModel);
      setData(body);
      if (selectedAccount) setAccountId(selectedAccount);
      if (selectedModel !== nextModel) {
        setModelKey(selectedModel);
      }
      setMessage("");
    } catch (error) { setMessage(error instanceof TypeError ? t("Could not reach the evaluation service.") : error instanceof Error ? error.message : t("Could not load evaluation data.")); }
    finally { setPending(""); }
  }, [accountId, modelKey, t]);

  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    void load("", "");
  }, [load]);

  async function act(action: "label" | "replay", values: Record<string, string>) {
    setPending(values.predictionId || action);
    try {
      const response = await fetch("/api/evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...values }) });
      const body = await response.json().catch(() => ({})) as { error?: string; calibration?: { status: string; sampleCount: number }; holdout?: { status: string; sampleCount: number; replayId: string | null } };
      if (!response.ok) throw new Error(body.error ? t(body.error) : t("The action could not be completed (HTTP {status}).", { status: response.status }));
      const success = action === "replay"
        ? t("Calibration: {calibrationStatus} ({calibrationCount}); separate holdout test: {holdoutStatus} ({holdoutCount}).", { calibrationStatus: t(body.calibration?.status === "calibrated" ? "Calibrated" : "Insufficient data"), calibrationCount: new Intl.NumberFormat(locale).format(body.calibration?.sampleCount ?? 0), holdoutStatus: t(body.holdout?.status === "calibrated" ? "Calibrated" : "Insufficient evidence"), holdoutCount: new Intl.NumberFormat(locale).format(body.holdout?.sampleCount ?? 0) })
        : t("Human label saved; labels cannot be changed later.");
      await load(accountId, modelKey);
      setMessage(success);
    } catch (error) { setMessage(error instanceof TypeError ? t("Could not reach the evaluation service.") : error instanceof Error ? error.message : t("The action could not be completed.")); }
    finally { setPending(""); }
  }

  const rows = data?.predictions.filter((row) => labelFilter === "all" || (labelFilter === "due" ? row.due && !row.label : row.label === labelFilter)) || [];
  const calibration = data?.calibration;

  return <div className="flex flex-col gap-5">
    <Alert><AlertDescription>{t("Raw score is a ranking/decision score, not a probability. Only values produced by a saved profile with calibrated status are shown as calibrated predictions. Holdout is scored only against this profile.")}</AlertDescription></Alert>
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><CardTitle>{t("Observations and human review")}</CardTitle><CardDescription>{t("Latest {count} decisions per account/model; overdue unlabeled candidates and saved human labels.", { count: new Intl.NumberFormat(locale).format(data?.historyLimit || 500) })}</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="evaluation-account">{t("Account")}</label>
          <select id="evaluation-account" className="h-9 rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(event) => { setAccountId(event.target.value); void load(event.target.value, modelKey); }}>
            {data?.accounts.map((account) => <option key={account.id} value={account.id}>@{account.handle} ⁜ {account.displayName}</option>)}
          </select>
          <label className="sr-only" htmlFor="evaluation-model">{t("Model")}</label>
          <select id="evaluation-model" className="h-9 rounded-md border bg-background px-3 text-sm" value={modelKey} onChange={(event) => { setModelKey(event.target.value); void load(accountId, event.target.value); }}>
            <option value="">{t("All models")}</option>{data?.models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <label className="sr-only" htmlFor="evaluation-filter">{t("Record filter")}</label>
          <select id="evaluation-filter" className="h-9 rounded-md border bg-background px-3 text-sm" value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
            <option value="due">{t("Awaiting label")}</option><option value="all">{t("All records")}</option>{labelOptions.map((label) => <option key={label} value={label}>{labelText(label)}</option>)}
          </select>
          <Button variant="outline" disabled={pending === "load"} onClick={() => void load()}>{pending === "load" ? t("Loading…") : t("Refresh")}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {pending === "load" && !data ? <p className="py-8 text-sm text-muted-foreground">{t("Loading evaluation records…")}</p> : null}
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-3">{t("Candidate / model")}</th><th className="p-3">{t("Decision / reason")}</th><th className="p-3">{t("Score / risk")}</th><th className="p-3">{t("Split / selection")}</th><th className="p-3">{t("Observed outcome")}</th><th className="p-3">{t("Label")}</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b align-top last:border-0">
            <td className="p-3"><div className="font-medium">{row.candidateId}</div><div className="max-w-56 truncate text-xs text-muted-foreground" title={row.modelKey}>{row.modelKey}</div><div className="mt-1 text-xs text-muted-foreground">{timestamp(row.createdAt, locale)} ⁜ {row.due ? t("Past due") : t("Due {date}", { date: timestamp(row.resolveBy, locale) })}</div></td>
            <td className="max-w-64 p-3"><Badge variant="outline">{labelText(row.decision)}</Badge><p className="mt-2 text-xs text-muted-foreground">{row.reason}</p></td>
            <td className="p-3 tabular-nums"><div>{t("Raw score")}: {new Intl.NumberFormat(locale).format(row.rawScore)}</div><div className="text-xs text-muted-foreground">{t("Risk")}: {labelText(row.riskTier || "unknown")}</div>{row.calibratedProbability !== null ? <div className="mt-1 text-xs">{t("Calibrated prediction")}: {new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(row.calibratedProbability)}</div> : <div className="mt-1 text-xs text-muted-foreground">{t("Probability not shown")}</div>}</td>
            <td className="p-3"><Badge variant="secondary">{labelText(row.split)}</Badge><div className="mt-2 text-xs text-muted-foreground">{t("Selection propensity")}: {row.selectionPropensity === null ? t("Unknown") : new Intl.NumberFormat(locale).format(row.selectionPropensity)}</div></td>
            <td className="max-w-80 p-3 text-xs text-muted-foreground">{outcomeText(row, locale, t)}{row.outcomes.length ? <div className="mt-1">{t("Source")}: {row.outcomes[row.outcomes.length - 1].source}</div> : null}</td>
            <td className="p-3">{row.label ? <Badge>{labelText(row.label)}</Badge> : <div className="flex min-w-56 items-center gap-2"><select aria-label={t("Label for {candidate}", { candidate: row.candidateId })} id={`label-${row.id}`} className="h-9 min-w-36 rounded-md border bg-background px-2 text-xs">{labelOptions.map((label) => <option key={label} value={label}>{labelText(label)}</option>)}</select><Button size="sm" disabled={Boolean(pending)} onClick={() => { const select = document.getElementById(`label-${row.id}`) as HTMLSelectElement | null; if (select) void act("label", { predictionId: row.id, label: select.value }); }}>{t("Save")}</Button></div>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="py-8 text-sm text-muted-foreground">{t("No due or labeled records for this filter. Pending due records are not silently counted as successful.")}</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>{t("Calibration and holdout")}</CardTitle><CardDescription>{t("Fit on the calibration split; replay the frozen profile on a separate holdout split.")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t("Calibration status")}</div><div className="mt-1 font-medium">{calibration?.status === "calibrated" ? t("Calibrated") : calibration ? t("Insufficient data") : t("No calibration profile yet")}</div><div className="text-xs text-muted-foreground">{t("{count} labeled samples", { count: new Intl.NumberFormat(locale).format(calibration?.sampleCount ?? 0) })}</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t("Calibration intervals")}</div>{calibration?.status === "calibrated" && calibration.mapping.length ? <div className="mt-1 space-y-1 text-xs">{calibration.mapping.map((bin, index) => <div key={`${bin.upperScore}:${index}`}>{t("Raw score ≤ {score}", { score: new Intl.NumberFormat(locale).format(bin.upperScore) })}: {new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bin.probability)} ⁜ n={new Intl.NumberFormat(locale).format(bin.count)}</div>)}</div> : <div className="mt-1 text-sm">{t("Insufficient evidence; probability is not shown")}</div>}</div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{t("Holdout records")}</div><div className="mt-1 text-sm">{t("{count} replay records", { count: new Intl.NumberFormat(locale).format(data?.replays.length || 0) })}</div>{data?.replays.slice(0, 3).map((replay) => <div key={replay.id} className="mt-1 text-xs text-muted-foreground">{timestamp(replay.createdAt, locale)} ⁜ {t("{count} samples", { count: new Intl.NumberFormat(locale).format(replay.sampleCount) })} ⁜ Brier {replay.brier ?? "—"} ⁜ log loss {replay.logLoss ?? "—"} ⁜ ECE {replay.ece ?? "—"}</div>)}</div>
        </div>
        <Button className="self-start" disabled={!accountId || !modelKey || Boolean(pending)} onClick={() => void act("replay", { accountId, modelKey })}>{pending === "replay" ? t("Replay running…") : t("Calculate calibration and evaluate on separate holdout data")}</Button>
        <p className="text-xs text-muted-foreground">{t("Policy/challenger counterfactuals are not calculated on this screen. Insufficient comparison evidence does not establish causal impact or model superiority.")}</p>
      </CardContent>
    </Card>
    {message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
  </div>;
}
