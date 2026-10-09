"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { EXCUSE_CAMPAIGN } from "@/i18n/excuse-campaign";

export function ExcuseBurner({ locale }: { locale: Locale }) {
  const copy = EXCUSE_CAMPAIGN[locale];
  const [selected, setSelected] = useState<number | null>(null);
  return <section id="proof-room" lang={locale} className="excuse-campaign border-y border-[var(--press-ink)] bg-[var(--press-surface)]">
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_.9fr]">
      <div><h2 className="press-serif max-w-2xl text-4xl leading-[1.02] sm:text-6xl">{copy.title}</h2><p className="mt-6 max-w-xl text-base leading-7">{copy.intro}</p><Link href={localizePath(locale, "/signup")} className="mt-8 inline-flex min-h-12 items-center gap-3 bg-[var(--press-ink)] px-5 font-semibold text-[var(--press-paper)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{copy.action}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></div>
      <div className="self-center">
        {selected === null ? <fieldset className="space-y-2"><legend className="mb-4 text-sm font-semibold">{copy.hint}</legend>{copy.choices.map((choice, index) => <button key={choice.excuse} type="button" onClick={() => setSelected(index)} className="group flex min-h-16 w-full items-center justify-between gap-4 border-b border-[var(--press-ink)]/30 py-4 text-start text-lg font-medium transition-colors hover:text-[var(--press-danger)] focus-visible:outline-2 focus-visible:outline-ring">{choice.excuse}<Flame className="size-5 shrink-0 transition-transform group-hover:-rotate-12 motion-reduce:transform-none" aria-hidden="true" /></button>)}</fieldset> : <div role="status" className="space-y-5"><del className="text-lg text-[var(--press-warm)] decoration-[var(--press-danger)] decoration-2">{copy.choices[selected].excuse}</del><h3 className="text-sm font-semibold">{copy.label}</h3><p className="press-serif text-2xl leading-relaxed">{copy.choices[selected].response}</p><button type="button" onClick={() => setSelected(null)} className="min-h-11 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{copy.reset}</button></div>}
      </div>
    </div>
  </section>;
}
