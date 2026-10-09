"use client";

import { useState } from "react";
import type { SignalPressCopy } from "@/i18n/signal-press";

const MAX_AMOUNT = 1_000_000;
const MAX_DRAFTS = 1_000_000;

export function estimateMonthlyCost(server: number, x: number, aiPerDraft: number, drafts: number): number {
  const amount = (value: number) => Number.isFinite(value) ? Math.min(MAX_AMOUNT, Math.max(0, value)) : 0;
  const count = Number.isFinite(drafts) ? Math.min(MAX_DRAFTS, Math.max(0, Math.floor(drafts))) : 0;
  return amount(server) + amount(x) + amount(aiPerDraft) * count;
}

export function CostEstimate({ copy }: { copy: SignalPressCopy }) {
  const [server, setServer] = useState("20");
  const [x, setX] = useState("0");
  const [ai, setAi] = useState("0.02");
  const [drafts, setDrafts] = useState("100");
  const total = estimateMonthlyCost(Number(server), Number(x), Number(ai), Number(drafts));
  const money = new Intl.NumberFormat(copy.contentLocale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(total);
  const field = (id: string, label: string, value: string, set: (value: string) => void, step: string) => <label htmlFor={id} className="block min-w-0 text-sm font-semibold">{label}<input id={id} type="number" min="0" max={MAX_AMOUNT} step={step} value={value} onChange={(event) => set(event.currentTarget.value)} className="mt-2 block h-11 w-full border border-[#16191e]/40 bg-white px-3 font-mono text-sm" /></label>;
  return <section aria-labelledby="cost-estimate-title" className="mt-6 border border-[#16191e]/25 bg-white/40 p-4 sm:p-5">
    <h4 id="cost-estimate-title" className="press-mono text-xs font-bold uppercase tracking-widest">{copy.costsTitle}</h4>
    <p className="mt-2 text-xs leading-5 text-[#66675f]">{copy.costsBody}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{field("cost-server", copy.serverCost, server, setServer, "0.01")}{field("cost-x-api", copy.xCost, x, setX, "0.01")}{field("cost-ai", copy.aiCost, ai, setAi, "0.0001")}{field("cost-drafts", copy.draftCount, drafts, setDrafts, "1")}</div>
    <p aria-live="polite" className="mt-5 border-t border-[#16191e]/20 pt-4 text-sm">{copy.monthlyTotal}: <strong className="press-mono text-lg">{money}</strong></p>
  </section>;
}
