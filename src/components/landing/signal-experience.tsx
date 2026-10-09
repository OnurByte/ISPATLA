"use client";

import { useRef, useState } from "react";
import type { SignalPressCopy } from "@/i18n/signal-press";
import { ExcuseBurner } from "./excuse-burner";
import { trackLandingEvent } from "@/lib/landing-measurement";

export function splitRevision(before: string, after: string) {
  const left = Array.from(before);
  const right = Array.from(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  return { prefix: left.slice(0, prefix).join(""), removed: left.slice(prefix, left.length - suffix).join(""), added: right.slice(prefix, right.length - suffix).join(""), suffix: suffix ? left.slice(left.length - suffix).join("") : "" };
}

export function SignalExperience({ copy }: { copy: SignalPressCopy }) {
  const [selected, setSelected] = useState(copy.examples[0].id);
  const started = useRef(false);
  const example = copy.examples.find((item) => item.id === selected) ?? copy.examples[0];
  const diff = splitRevision(example.draft, example.revised);

  return <>
    <section id="signal-detector" className="scroll-mt-8 border-y-2 border-[#16191e] bg-[#e5e1d7]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="press-mono text-xs tracking-[.15em] text-[#315bf5]">01 / {copy.issue}</p>
          <h2 className="press-serif mt-4 text-4xl leading-[.98] tracking-tight sm:text-6xl">{copy.detectorTitle}</h2>
          <p className="mt-6 max-w-lg text-base leading-7">{copy.detectorIntro}</p>
          <div className="mt-7 space-y-2" role="group" aria-label={copy.source}>
            {copy.examples.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => { if (!started.current) { started.current = true; trackLandingEvent("demo_start", "/"); } setSelected(item.id); }} className={`flex min-h-12 w-full items-center gap-3 border px-4 py-3 text-start transition-colors ${selected === item.id ? "border-[#315bf5] bg-[#315bf5] text-white" : "border-[#16191e]/25 bg-transparent hover:bg-white/60"}`}>
              <span className="press-mono text-xs">0{index + 1}</span><span className="min-w-0 flex-1 text-sm font-semibold">{item.source}</span><span className="text-xs">{selected === item.id ? "●" : "○"}</span>
            </button>)}
          </div>
        </div>
        <article className="relative min-w-0 border-2 border-[#16191e] bg-[#f0ede5] p-5 shadow-[8px_8px_0_#16191e] sm:p-9">
          <div className="press-mono flex items-center justify-between border-b border-[#16191e]/25 pb-4 text-[10px] uppercase tracking-[.14em]"><span>{copy.selected}</span><span>0{copy.examples.findIndex((item) => item.id === selected) + 1}</span></div>
          <p className="press-serif mt-8 text-2xl leading-snug sm:text-4xl">“{example.post}”</p>
          <div className="mt-8 grid gap-6 border-t border-[#16191e]/25 pt-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="press-mono flex size-24 flex-col items-center justify-center rounded-full border-2 border-dashed border-[#315bf5] text-center text-[#315bf5]" aria-label={`${copy.fit}: ${example.score}/100`}><strong className="text-3xl">{example.score}</strong><span className="text-[9px] uppercase">/100</span></div>
            <div><p className="press-mono text-xs uppercase tracking-widest">{copy.fit} · {example.verdict === "reject" ? copy.rejected : copy.accepted}</p><p className="mt-2 text-sm leading-6">{example.reason}</p></div>
          </div>
          <a href="#writing-room" className="mt-7 inline-flex min-h-11 items-center border-b-2 border-[#315bf5] text-sm font-bold text-[#315bf5]">{copy.inspect} ↓</a>
          <span aria-hidden="true" className="press-paper-grain pointer-events-none absolute -end-2 -top-2 size-14 opacity-10" />
        </article>
      </div>
    </section>

    <section id="writing-room" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
        <div><p className="press-mono text-xs tracking-[.15em] text-[#315bf5]">{copy.writingKicker}</p><h2 className="press-serif mt-4 text-4xl leading-none sm:text-6xl">{copy.writingTitle}</h2><p className="mt-6 text-base leading-7">{copy.writingIntro}</p><p className="press-mono mt-8 border-l-2 border-[#315bf5] ps-4 text-sm">{copy.approval}</p></div>
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <p className="press-mono text-xs text-[#315bf5] md:col-span-2">{copy.accountLabel} · @sample_account</p>
          <p className="press-mono text-xs text-[#9a9a91] md:col-span-2">{copy.historyLabel}</p>
          <article className="min-w-0 border border-[#16191e]/25 bg-white/40 p-5 sm:p-7"><p className="press-mono text-xs uppercase tracking-wider text-[#9a9a91]">{copy.revisionA}</p><p className="mt-5 text-base leading-7">{diff.prefix}<del className="bg-[#bc453d]/15 text-[#bc453d]">{diff.removed}</del>{diff.suffix}</p></article>
          <article className="min-w-0 border-2 border-[#315bf5] bg-white/60 p-5 sm:p-7"><p className="press-mono text-xs uppercase tracking-wider text-[#315bf5]">{copy.revisionB}</p><p className="mt-5 text-base leading-7">{diff.prefix}<ins className="bg-[#315bf5]/10 text-[#16191e] decoration-[#315bf5]">{diff.added}</ins>{diff.suffix}</p></article>
          <p className="press-mono text-xs text-[#9a9a91]">{copy.before}: {copy.revisionA} / {copy.after}: {copy.revisionB}</p>
        </div>
      </div>
    </section>

    <ExcuseBurner locale={copy.contentLocale} />
  </>;
}
