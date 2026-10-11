"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldSet, FieldLegend } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { EXCUSE_CAMPAIGN } from "@/i18n/excuse-campaign";

export function ExcuseBurner({ locale, startHref = localizePath(locale, "/signup") }: { locale: Locale; startHref?: string }) {
  const copy = EXCUSE_CAMPAIGN[locale];
  const [selected, setSelected] = useState<number | null>(null);
  return <section id="proof-room" lang={locale} className="excuse-campaign border-y border-border bg-muted/30">
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_.9fr]">
      <div><h2 className="font-heading max-w-2xl text-4xl leading-[1.02] sm:text-6xl">{copy.title}</h2><p className="mt-6 max-w-xl text-base leading-7">{copy.intro}</p><Button role="link" nativeButton={false} render={<Link href={startHref} />} size="lg" className="mt-8 min-h-11 px-5">{copy.action}<ArrowUpRight aria-hidden="true" data-icon="inline-end" /></Button></div>
      <div className="self-center">
        {selected === null ? <FieldSet><FieldLegend>{copy.hint}</FieldLegend>{copy.choices.map((choice, index) => <Button key={choice.excuse} variant="outline" size="lg" onClick={() => setSelected(index)} className="min-h-16 w-full justify-between whitespace-normal text-start">{choice.excuse}<Flame data-icon="inline-end" aria-hidden="true" /></Button>)}</FieldSet> : <Alert role="status" className="flex flex-col gap-5"><del className="text-muted-foreground">{copy.choices[selected].excuse}</del><AlertTitle>{copy.label}</AlertTitle><AlertDescription>{copy.choices[selected].response}</AlertDescription><Button variant="link" onClick={() => setSelected(null)} className="min-h-11 self-start">{copy.reset}</Button></Alert>}
      </div>
    </div>
  </section>;
}
