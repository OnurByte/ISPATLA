"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

function timestamp(value: number) { return new Date(value * 1000).toLocaleString("tr-TR"); }
function outcomeText(row: PredictionRow) {
  if (!row.outcomes.length) return "Henüz gözlenen sonuç yok";
  const latest = row.outcomes[row.outcomes.length - 1];
  const metrics = Object.entries(latest.metrics).map(([name, value]) => `${name}: ${value === null ? "bilinmiyor" : value.toLocaleString("tr-TR")}`).join(" · ");
  const censored = latest.censored.length ? ` · sansürlü: ${latest.censored.join(", ")}` : "";
  return `${metrics}${censored} · ${timestamp(latest.observedAt)}`;
}

export function EvaluationPage() {
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
        if (!response.ok) throw new Error(result.error || `Değerlendirme verisi alınamadı (${response.status}).`);
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
    } catch (error) { setMessage(error instanceof TypeError ? "Değerlendirme servisine ulaşılamadı." : error instanceof Error ? error.message : "Değerlendirme verisi alınamadı."); }
    finally { setPending(""); }
  }, [accountId, modelKey]);

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
      if (!response.ok) throw new Error(body.error || `İşlem tamamlanamadı (${response.status}).`);
      const success = action === "replay"
        ? `Kalibrasyon: ${body.calibration?.status === "calibrated" ? "kalibre edildi" : "örnek yetersiz"} (${body.calibration?.sampleCount ?? 0}); ayrı holdout testi: ${body.holdout?.status === "calibrated" ? "kalibre" : "yetersiz kanıt"} (${body.holdout?.sampleCount ?? 0}).`
        : "İnsan etiketi kaydedildi; etiket sonradan değiştirilemez.";
      await load(accountId, modelKey);
      setMessage(success);
    } catch (error) { setMessage(error instanceof TypeError ? "Değerlendirme servisine ulaşılamadı." : error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setPending(""); }
  }

  const rows = data?.predictions.filter((row) => labelFilter === "all" || (labelFilter === "due" ? row.due && !row.label : row.label === labelFilter)) || [];
  const calibration = data?.calibration;

  return <div className="flex flex-col gap-5">
    <Alert><AlertDescription>Ham skor sıralama/karar skorudur; olasılık değildir. Yalnız kalibrasyon durumu calibrated olan kayıtlı profile göre üretilmiş değerler “kalibre edilmiş tahmin” olarak gösterilir. Holdout yalnız bu profile karşı puanlanır.</AlertDescription></Alert>
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><CardTitle>Gözlem ve insan incelemesi</CardTitle><CardDescription>Hesap/model başına en yeni {data?.historyLimit || 500} karar; gecikmiş etiketsiz adaylar ve kayıtlı insan etiketleri.</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="evaluation-account">Hesap</label>
          <select id="evaluation-account" className="h-9 rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(event) => { setAccountId(event.target.value); void load(event.target.value, modelKey); }}>
            {data?.accounts.map((account) => <option key={account.id} value={account.id}>@{account.handle} · {account.displayName}</option>)}
          </select>
          <label className="sr-only" htmlFor="evaluation-model">Model</label>
          <select id="evaluation-model" className="h-9 rounded-md border bg-background px-3 text-sm" value={modelKey} onChange={(event) => { setModelKey(event.target.value); void load(accountId, event.target.value); }}>
            <option value="">Tüm modeller</option>{data?.models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <label className="sr-only" htmlFor="evaluation-filter">Kayıt filtresi</label>
          <select id="evaluation-filter" className="h-9 rounded-md border bg-background px-3 text-sm" value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
            <option value="due">Etiket bekleyenler</option><option value="all">Tüm kayıtlar</option>{labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
          <Button variant="outline" disabled={pending === "load"} onClick={() => void load()}>{pending === "load" ? "Yükleniyor…" : "Yenile"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        {pending === "load" && !data ? <p className="py-8 text-sm text-muted-foreground">Değerlendirme kayıtları yükleniyor…</p> : null}
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-3">Aday / model</th><th className="p-3">Karar / neden</th><th className="p-3">Skor / risk</th><th className="p-3">Split / seçim</th><th className="p-3">Gözlenen sonuç</th><th className="p-3">Etiket</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-b align-top last:border-0">
            <td className="p-3"><div className="font-medium">{row.candidateId}</div><div className="max-w-56 truncate text-xs text-muted-foreground" title={row.modelKey}>{row.modelKey}</div><div className="mt-1 text-xs text-muted-foreground">{timestamp(row.createdAt)} · {row.due ? "vade geçti" : `vade ${timestamp(row.resolveBy)}`}</div></td>
            <td className="max-w-64 p-3"><Badge variant="outline">{row.decision}</Badge><p className="mt-2 text-xs text-muted-foreground">{row.reason}</p></td>
            <td className="p-3 tabular-nums"><div>Ham: {row.rawScore}</div><div className="text-xs text-muted-foreground">Risk: {row.riskTier || "unknown"}</div>{row.calibratedProbability !== null ? <div className="mt-1 text-xs">Kalibre edilmiş tahmin: {(row.calibratedProbability * 100).toFixed(1)}%</div> : <div className="mt-1 text-xs text-muted-foreground">Olasılık gösterilmez</div>}</td>
            <td className="p-3"><Badge variant="secondary">{row.split}</Badge><div className="mt-2 text-xs text-muted-foreground">Seçim propensity: {row.selectionPropensity === null ? "unknown" : row.selectionPropensity}</div></td>
            <td className="max-w-80 p-3 text-xs text-muted-foreground">{outcomeText(row)}{row.outcomes.length ? <div className="mt-1">Kaynak: {row.outcomes[row.outcomes.length - 1].source}</div> : null}</td>
            <td className="p-3">{row.label ? <Badge>{row.label}</Badge> : <div className="flex min-w-56 items-center gap-2"><select aria-label={`${row.candidateId} etiketi`} id={`label-${row.id}`} className="h-9 min-w-36 rounded-md border bg-background px-2 text-xs">{labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}</select><Button size="sm" disabled={Boolean(pending)} onClick={() => { const select = document.getElementById(`label-${row.id}`) as HTMLSelectElement | null; if (select) void act("label", { predictionId: row.id, label: select.value }); }}>Kaydet</Button></div>}</td>
          </tr>)}</tbody>
        </table></div> : <p className="py-8 text-sm text-muted-foreground">Bu filtre için due veya etiketlenmiş kayıt yok. Bekleyen due kayıtlar sessizce başarılı sayılmaz.</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Kalibrasyon ve holdout</CardTitle><CardDescription>Calibration split&apos;inden fit; ayrı holdout split&apos;inde frozen profile replay.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Kalibrasyon durumu</div><div className="mt-1 font-medium">{calibration?.status === "calibrated" ? "Kalibre edildi" : calibration ? "Örnek yetersiz" : "Henüz profil yok"}</div><div className="text-xs text-muted-foreground">{calibration?.sampleCount ?? 0} etiketli örnek</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Kalibrasyon aralıkları</div>{calibration?.status === "calibrated" && calibration.mapping.length ? <div className="mt-1 space-y-1 text-xs">{calibration.mapping.map((bin, index) => <div key={`${bin.upperScore}:${index}`}>Ham skor ≤ {bin.upperScore}: {(bin.probability * 100).toFixed(1)}% · n={bin.count}</div>)}</div> : <div className="mt-1 text-sm">Yetersiz kanıt; olasılık gösterilmiyor</div>}</div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Holdout kayıtları</div><div className="mt-1 text-sm">{data?.replays.length || 0} replay kaydı</div>{data?.replays.slice(0, 3).map((replay) => <div key={replay.id} className="mt-1 text-xs text-muted-foreground">{timestamp(replay.createdAt)} · {replay.sampleCount} örnek · Brier {replay.brier ?? "—"} · log loss {replay.logLoss ?? "—"} · ECE {replay.ece ?? "—"}</div>)}</div>
        </div>
        <Button className="self-start" disabled={!accountId || !modelKey || Boolean(pending)} onClick={() => void act("replay", { accountId, modelKey })}>{pending === "replay" ? "Replay çalışıyor…" : "Kalibrasyonu hesapla ve ayrı holdout verisinde değerlendir"}</Button>
        <p className="text-xs text-muted-foreground">Policy/challenger karşı-olguları bu ekranda hesaplanmıyor. Yetersiz karşılaştırma kanıtından nedensel etki veya model üstünlüğü çıkarılmaz.</p>
      </CardContent>
    </Card>
    {message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
  </div>;
}
