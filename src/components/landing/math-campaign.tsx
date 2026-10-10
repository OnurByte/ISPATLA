"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { MathCampaignCopy } from "@/i18n/math-campaign";

export const MATH_CAMPAIGN_SCENARIOS = [
  { budget: 2, candidates: 3, key: "2:3" },
  { budget: 2, candidates: 6, key: "2:6" },
  { budget: 4, candidates: 3, key: "4:3" },
  { budget: 4, candidates: 6, key: "4:6" },
] as const;

export type MathScenarioKey = "2:3" | "2:6" | "4:3" | "4:6";

export function mathScenarioKey(budget: number, candidates: number): MathScenarioKey {
  return `${budget}:${candidates}` as MathScenarioKey;
}

const RESEARCH_FORMULAS = [
  <span key="cusum">r<sub>t</sub> = (E<sub>t</sub> − E<sub>t−Δ</sub>) / Δ</span>,
  <span key="hawkes">λ(t) = μ(t) + Σ<sub>tᵢ &lt; t</sub> αe<sup>−β(t−tᵢ)</sup></span>,
  <span key="coverage">F(S) = Σ<sub>e</sub> w<sub>e</sub> max<sub>s∈S</sub> q<sub>s,e</sub></span>,
  <span key="portfolio">Π(S) = Σ<sub>i∈S</sub> U<sub>i</sub> − λD(S) − μC(S)</span>,
] as const;

export function MathCampaign({ locale, dir, copy, startHref }: {
  locale: Locale;
  dir: "ltr" | "rtl";
  copy: MathCampaignCopy;
  startHref: string;
}) {
  const [budget, setBudget] = useState(copy.experiment.budgetChoices[0].value);
  const [candidates, setCandidates] = useState(copy.experiment.candidateChoices[0].value);
  const outcome = copy.experiment.outcomes[mathScenarioKey(budget, candidates)];
  const number = new Intl.NumberFormat(locale);

  return <section id="math-campaign" lang={locale} dir={dir} className="scroll-mt-8 overflow-hidden border-y-2 border-[color:var(--press-ink)] bg-[var(--press-surface)] text-[var(--press-ink)]">
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:py-28">
      <header className="grid gap-8 border-b border-[color:var(--press-ink)]/25 pb-10 lg:grid-cols-[1.15fr_.85fr] lg:items-end lg:gap-16 lg:pb-14">
        <div>
          <p className="press-mono text-xs font-bold uppercase tracking-[.18em] text-[var(--press-blue)]">{copy.eyebrow}</p>
          <h2 className="press-serif mt-6 max-w-5xl text-[clamp(3.25rem,9vw,8rem)] leading-[.84] tracking-[-.055em]">{copy.headline}</h2>
          <p className="press-mono mt-7 inline-flex border border-[color:var(--press-ink)]/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[.13em]">{copy.statusLabel}</p>
        </div>
        <div className="border-s-2 border-[var(--press-blue)] ps-5 sm:ps-7">
          <p className="text-lg font-semibold leading-7 sm:text-xl sm:leading-8">{copy.statusBody}</p>
          <p className="mt-5 text-sm leading-7 text-[var(--press-warm)]">{copy.intro}</p>
        </div>
      </header>

      <div className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[.55fr_1.45fr] lg:gap-20">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="press-mono text-xs uppercase tracking-[.16em] text-[var(--press-blue)]">{copy.manifesto[0]}</p>
          <p className="press-serif mt-5 text-3xl leading-tight sm:text-4xl">{copy.manifesto[1]}</p>
        </div>
        <div className="space-y-6 text-base leading-8 sm:text-lg sm:leading-9">
          {copy.manifesto.slice(2).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </div>

      <div className="border-t-2 border-[color:var(--press-ink)] pt-8 sm:pt-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <p className="press-mono text-xs uppercase tracking-[.16em] text-[var(--press-blue)]">{copy.statusLabel}</p>
          <p className="press-mono text-[10px] uppercase tracking-[.12em] text-[var(--press-warm)]">{number.format(copy.features.length).padStart(2, "0")}</p>
        </div>
        <div className="divide-y divide-[color:var(--press-ink)]/25 border-y border-[color:var(--press-ink)]/25">
          {copy.features.map((feature, index) => <article key={feature.title} className="grid gap-3 py-6 sm:grid-cols-[4rem_1fr_auto] sm:items-start sm:gap-6 sm:py-8">
            <span className="press-mono text-xs text-[var(--press-blue)]">0{index + 1}</span>
            <div className="min-w-0 max-w-3xl">
              <h3 className="press-serif text-2xl leading-tight sm:text-3xl">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 sm:text-base sm:leading-8">{feature.body}</p>
              <figure className="mt-5 min-w-0 border-s-2 border-[var(--press-blue)] bg-[var(--press-paper)] px-4 py-3">
                <div dir="ltr" role="group" tabIndex={0} aria-labelledby={`math-formula-${index}`} className="press-mono overflow-x-auto py-1 text-base font-semibold leading-7 tracking-tight text-[var(--press-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--press-blue)] sm:text-lg"><span aria-hidden="true" className="whitespace-nowrap">{RESEARCH_FORMULAS[index]}</span></div>
                <figcaption id={`math-formula-${index}`} className="mt-2 text-xs leading-5 text-[var(--press-warm)]">{feature.formulaLegend}</figcaption>
              </figure>
            </div>
            <span className="press-mono mt-1 text-[10px] uppercase tracking-[.14em] text-[var(--press-warm)] sm:text-end">{feature.mathLabel}</span>
          </article>)}
        </div>
      </div>

      <section aria-labelledby="math-experiment-title" className="mt-14 grid overflow-hidden border-2 border-[color:var(--press-ink)] lg:mt-20 lg:grid-cols-[.8fr_1.2fr]">
        <div className="bg-[var(--press-ink)] p-6 text-[var(--press-paper)] sm:p-9 lg:p-11">
          <p className="press-mono text-[10px] uppercase tracking-[.16em] text-[var(--press-paper)] opacity-80">{copy.experiment.note}</p>
          <h3 id="math-experiment-title" className="press-serif mt-5 text-3xl leading-tight sm:text-4xl">{copy.experiment.title}</h3>
          <p className="mt-4 text-sm leading-7 opacity-80">{copy.experiment.body}</p>
          <p className="press-mono mt-8 border-s border-[var(--press-blue)] ps-4 text-xs leading-6">{copy.experiment.prompt}</p>
        </div>
        <div className="p-6 sm:p-9 lg:p-11">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p id="math-budget-label" className="text-sm font-semibold">{copy.experiment.budgetLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="math-budget-label">{copy.experiment.budgetChoices.map((choice) => <button key={choice.value} type="button" aria-pressed={budget === choice.value} onClick={() => setBudget(choice.value)} className="min-h-12 border border-[color:var(--press-ink)]/40 px-4 py-2 text-sm font-semibold transition-colors aria-pressed:border-[rgb(49,91,245)] aria-pressed:bg-[rgb(49,91,245)] aria-pressed:text-white hover:bg-[var(--press-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--press-blue)]">{choice.label}</button>)}</div>
            </div>
            <div>
              <p id="math-candidates-label" className="text-sm font-semibold">{copy.experiment.candidateLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="math-candidates-label">{copy.experiment.candidateChoices.map((choice) => <button key={choice.value} type="button" aria-pressed={candidates === choice.value} onClick={() => setCandidates(choice.value)} className="min-h-12 border border-[color:var(--press-ink)]/40 px-4 py-2 text-sm font-semibold transition-colors aria-pressed:border-[rgb(49,91,245)] aria-pressed:bg-[rgb(49,91,245)] aria-pressed:text-white hover:bg-[var(--press-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--press-blue)]">{choice.label}</button>)}</div>
            </div>
          </div>
          <div className="mt-7 border-s-4 border-[var(--press-blue)] bg-[color-mix(in_srgb,var(--press-blue)_8%,var(--press-paper))] p-5 sm:p-6" aria-live="polite" aria-atomic="true">
            <p className="press-mono text-[10px] uppercase tracking-[.13em] text-[var(--press-blue)]">{number.format(budget)} · {number.format(candidates)}</p>
            <h4 className="press-serif mt-3 text-2xl leading-tight">{outcome.title}</h4>
            <p className="mt-3 text-sm leading-7">{outcome.body}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 border-t border-[color:var(--press-ink)]/25 pt-10 sm:pt-14 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
        <p className="press-serif max-w-lg text-3xl leading-tight sm:text-4xl">{copy.limits[0]}</p>
        <div className="space-y-5 text-sm leading-7 sm:text-base sm:leading-8">
          {copy.limits.slice(1).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </div>

      <footer className="relative mt-14 overflow-hidden bg-[#315bf5] p-6 text-white sm:mt-20 sm:p-10 lg:p-14">
        <span className="press-serif pointer-events-none absolute -end-3 -top-10 select-none text-[12rem] leading-none opacity-10 sm:text-[17rem]" aria-hidden="true">∑</span>
        <div className="relative max-w-4xl">
          <p className="press-mono text-[10px] uppercase tracking-[.16em]">{copy.eyebrow}</p>
          <h3 className="press-serif mt-5 text-4xl leading-[.95] tracking-tight sm:text-6xl">{copy.closing.title}</h3>
          <p className="mt-5 max-w-2xl text-sm leading-7 sm:text-base sm:leading-8">{copy.closing.body}</p>
          <Link href={startHref} className="mt-8 inline-flex min-h-12 items-center gap-4 border border-white px-5 py-3 text-sm font-bold hover:bg-white hover:text-[#16191e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{copy.closing.cta}<span aria-hidden="true">↗</span></Link>
        </div>
      </footer>
    </div>
  </section>;
}
