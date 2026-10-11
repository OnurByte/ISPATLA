"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const field = (id: string, label: string, value: string, set: (value: string) => void, step: string) => <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} type="number" min="0" max={MAX_AMOUNT} step={step} value={value} onChange={(event) => set(event.currentTarget.value)} />
  </Field>;
  return <Card aria-labelledby="cost-estimate-title" className="mt-6">
    <CardHeader><CardTitle><h4 id="cost-estimate-title">{copy.costsTitle}</h4></CardTitle><CardDescription>{copy.costsBody}</CardDescription></CardHeader>
    <CardContent><FieldGroup className="grid sm:grid-cols-2">{field("cost-server", copy.serverCost, server, setServer, "0.01")}{field("cost-x-api", copy.xCost, x, setX, "0.01")}{field("cost-ai", copy.aiCost, ai, setAi, "0.0001")}{field("cost-drafts", copy.draftCount, drafts, setDrafts, "1")}</FieldGroup></CardContent>
    <CardFooter><p aria-live="polite">{copy.monthlyTotal}: <strong>{money}</strong></p></CardFooter>
  </Card>;
}
