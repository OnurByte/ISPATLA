"use client";

import { useRef, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Check, Ban, ArrowDown } from "lucide-react";
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
    <section id="signal-detector" className="scroll-mt-8 bg-muted">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <h2 className="mt-4 text-4xl leading-[.98] tracking-tight sm:text-6xl">{copy.detectorTitle}</h2>
          <p className="mt-6 max-w-lg text-base leading-7">{copy.detectorIntro}</p>
          <ToggleGroup value={[selected]} onValueChange={(values) => { if (!started.current) { started.current = true; trackLandingEvent("demo_start", "/"); } if (values[0]) setSelected(values[0]); }} variant="outline" orientation="vertical" spacing={2} aria-label={copy.source} className="mt-7 w-full items-stretch">
            {copy.examples.map((item) => <ToggleGroupItem key={item.id} value={item.id} className="min-h-12 w-full justify-start px-4 py-3"><span className="min-w-0 truncate">{item.source}</span></ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <article className="flex min-w-0 flex-col gap-6">
          <TweetCard source={example.source} synthetic={copy.synthetic}>{example.post}</TweetCard>
          <Alert variant={example.verdict === "reject" ? "destructive" : "default"}>
            {example.verdict === "reject" ? <Ban aria-hidden="true" /> : <Check aria-hidden="true" />}
            <AlertTitle>{example.verdict === "reject" ? copy.rejected : copy.accepted}</AlertTitle>
            <AlertDescription>{example.reason}</AlertDescription>
          </Alert>
          <Button render={<a href="#writing-room" />} nativeButton={false} role="link" variant="outline" size="lg" className="self-start" onClick={() => { if (started.current && !completed.current) { completed.current = true; trackLandingEvent("demo_complete", "/"); } }}>{copy.inspect}<ArrowDown data-icon="inline-end" /></Button>
        </article>
      </div>
    </section>

    <section id="writing-room" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
        <div><h2 className="mt-4 text-4xl leading-none sm:text-6xl">{copy.writingTitle}</h2><p className="mt-6 text-base leading-7">{copy.writingIntro}</p><Separator className="my-6" /><p className="text-sm text-muted-foreground">{copy.approval}</p></div>
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <div className="min-w-0"><p className="mb-3 text-sm font-bold">{copy.before}</p><TweetCard source="@sample_account" synthetic={copy.synthetic}>{diff.prefix}<del className="bg-destructive/10 text-destructive">{diff.removed}</del>{diff.suffix}</TweetCard></div>
          {example.verdict === "reject" ? <Alert variant="destructive" className="h-fit"><Ban aria-hidden="true" /><AlertTitle>{copy.rejected}</AlertTitle><AlertDescription><p>{example.revised}</p><p>{example.reason}</p></AlertDescription></Alert> : <div className="min-w-0"><p className="mb-3 text-sm font-bold">{copy.after}</p><TweetCard source="@sample_account" synthetic={copy.synthetic}>{diff.prefix}<ins className="bg-accent">{diff.added}</ins>{diff.suffix}</TweetCard></div>}
        </div>
      </div>
    </section>

    <ExcuseBurner locale={copy.contentLocale} startHref={startHref} />
  </>;
}
