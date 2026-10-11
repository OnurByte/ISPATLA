"use client";

import { useRef, useState } from "react";
import { Check, Ban } from "lucide-react";
import type { SignalPressCopy } from "@/i18n/signal-press";
import { TweetCard } from "./tweet-card";
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

export function SignalExperience({ copy, startHref }: { copy: SignalPressCopy; startHref: string }) {
  const [selected, setSelected] = useState(copy.examples[0].id);
  const started = useRef(false);
  const completed = useRef(false);
  const example = copy.examples.find((item) => item.id === selected) ?? copy.examples[0];
  const diff = splitRevision(example.draft, example.revised);

  return <>
    <section id="signal-detector" className="scroll-mt-8 border-y-2 border-[#16191e] bg-[#e5e1d7]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <h2 className="press-serif mt-4 text-4xl leading-[.98] tracking-tight sm:text-6xl">{copy.detectorTitle}</h2>
          <p className="mt-6 max-w-lg text-base leading-7">{copy.detectorIntro}</p>
          <div className="mt-7 space-y-2" role="group" aria-label={copy.source}>
            {copy.examples.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => { if (!started.current) { started.current = true; trackLandingEvent("demo_start", "/"); } setSelected(item.id); }} className={`flex min-h-12 w-full items-center gap-3 border px-4 py-3 text-start transition-colors ${selected === item.id ? "border-[#315bf5] bg-[#315bf5] text-white" : "border-[#16191e]/25 bg-transparent hover:bg-white/60"}`}>
              <span className="min-w-0 flex-1 text-sm font-semibold">{item.source}</span><span className="text-xs">{selected === item.id ? "●" : "○"}</span>
            </button>)}
          </div>
        </div>
        <article className="relative min-w-0 border-2 border-[#16191e] bg-[#f0ede5] p-5 shadow-[8px_8px_0_#16191e] sm:p-9">
          <TweetCard source={example.source} synthetic={copy.synthetic}>{example.post}</TweetCard>
          <div className="mt-6 border-t border-[#16191e]/25 pt-6">
            <p className={`flex items-center gap-2 text-lg font-bold ${example.verdict === "reject" ? "text-[var(--press-danger)]" : "text-[var(--press-blue)]"}`}>{example.verdict === "reject" ? <Ban aria-hidden="true" size={20} /> : <Check aria-hidden="true" size={20} />}{example.verdict === "reject" ? copy.rejected : copy.accepted}</p>
            <p className="mt-3 text-sm leading-6">{example.reason}</p>
          </div>
          <a href="#writing-room" onClick={() => { if (started.current && !completed.current) { completed.current = true; trackLandingEvent("demo_complete", "/"); } }} className="mt-7 inline-flex min-h-11 items-center border-b-2 border-[#315bf5] text-sm font-bold text-[#315bf5]">{copy.inspect} ↓</a>
          <span aria-hidden="true" className="press-paper-grain pointer-events-none absolute -end-2 -top-2 size-14 opacity-10" />
        </article>
      </div>
    </section>

    <section id="writing-room" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
        <div><h2 className="press-serif mt-4 text-4xl leading-none sm:text-6xl">{copy.writingTitle}</h2><p className="mt-6 text-base leading-7">{copy.writingIntro}</p><p className="press-mono mt-8 border-l-2 border-[#315bf5] ps-4 text-sm">{copy.approval}</p></div>
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <div className="min-w-0"><p className="mb-3 text-sm font-bold">{copy.before}</p><TweetCard source="@sample_account" synthetic={copy.synthetic}>{diff.prefix}<del className="bg-[#bc453d]/15 text-[var(--press-danger)]">{diff.removed}</del>{diff.suffix}</TweetCard></div>
          {example.verdict === "reject" ? <div className="min-w-0 border border-[#9b302a]/30 bg-[#bc453d]/5 p-5 sm:p-6"><p className="flex items-center gap-2 text-lg font-bold text-[var(--press-danger)]"><Ban aria-hidden="true" size={20} />{copy.rejected}</p><p className="mt-4 text-base leading-7">{example.revised}</p><p className="mt-4 text-sm leading-6">{example.reason}</p></div> : <div className="min-w-0"><p className="mb-3 text-sm font-bold text-[var(--press-blue)]">{copy.after}</p><TweetCard source="@sample_account" synthetic={copy.synthetic}>{diff.prefix}<ins className="bg-[#315bf5]/10 text-[#16191e] decoration-[#315bf5]">{diff.added}</ins>{diff.suffix}</TweetCard></div>}
        </div>
      </div>
    </section>

    <ExcuseBurner locale={copy.contentLocale} startHref={startHref} />
  </>;
}
