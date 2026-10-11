"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  const [budget, setBudget] = useState<number>(copy.experiment.budgetChoices[0].value);
  const [candidates, setCandidates] = useState<number>(copy.experiment.candidateChoices[0].value);
  const outcome = copy.experiment.outcomes[mathScenarioKey(budget, candidates)];

  return <section id="math-campaign" lang={locale} dir={dir} className="scroll-mt-8 overflow-hidden bg-background text-foreground">
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24 lg:py-28">
      <header className="grid gap-8 pb-10 lg:grid-cols-[1.15fr_.85fr] lg:items-end lg:gap-16 lg:pb-14">
        <div>
          <h2 className="font-heading mt-6 max-w-5xl text-[clamp(3.25rem,9vw,6rem)] leading-[1.02] tracking-[-.035em]">{copy.headline}</h2>
        </div>
        <div className="">
          <p className="text-lg font-semibold leading-7 sm:text-xl sm:leading-8">{copy.statusBody}</p>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">{copy.intro}</p>
        </div>
      </header>
      <Separator />

      <div className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[.55fr_1.45fr] lg:gap-20">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="font-heading mt-5 text-3xl leading-tight sm:text-4xl">{copy.manifesto[1]}</p>
        </div>
        <div className="flex flex-col gap-6 text-base leading-8 sm:text-lg sm:leading-9">
          {copy.manifesto.slice(2).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      </div>

      <Separator />
      <div className="grid gap-6 py-8 sm:grid-cols-2">
        {copy.features.map((feature, index) => <Card key={feature.title}>
          <CardHeader><CardTitle><h3>{feature.title}</h3></CardTitle><CardDescription>{feature.body}</CardDescription></CardHeader>
          <CardContent><figure className="min-w-0">
            <div dir="ltr" role="group" tabIndex={0} aria-labelledby={`math-formula-${index}`} className="overflow-x-auto py-1 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span aria-hidden="true" className="whitespace-nowrap">{RESEARCH_FORMULAS[index]}</span></div>
            <figcaption id={`math-formula-${index}`} className="mt-2 text-xs leading-5 text-muted-foreground">{feature.formulaLegend}</figcaption>
          </figure></CardContent>
        </Card>)}
      </div>

      <Card aria-labelledby="math-experiment-title" className="my-8 lg:my-12">
        <CardHeader>
          <span className="sr-only">{copy.experiment.note}</span>
          <CardTitle><h3 id="math-experiment-title">{copy.experiment.title}</h3></CardTitle>
          <CardDescription>{copy.experiment.body}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-7">
          <FieldGroup className="grid sm:grid-cols-2">
            <Field><FieldLabel id="math-budget-label">{copy.experiment.budgetLabel}</FieldLabel>
              <ToggleGroup variant="outline" value={[String(budget)]} onValueChange={(values) => { if (values.length) setBudget(Number(values[0])); }} aria-labelledby="math-budget-label" className="flex-wrap">
                {copy.experiment.budgetChoices.map((choice) => <ToggleGroupItem key={choice.value} value={String(choice.value)} className="min-h-11 px-4 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground">{choice.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
            <Field><FieldLabel id="math-candidates-label">{copy.experiment.candidateLabel}</FieldLabel>
              <ToggleGroup variant="outline" value={[String(candidates)]} onValueChange={(values) => { if (values.length) setCandidates(Number(values[0])); }} aria-labelledby="math-candidates-label" className="flex-wrap">
                {copy.experiment.candidateChoices.map((choice) => <ToggleGroupItem key={choice.value} value={String(choice.value)} className="min-h-11 px-4 aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground">{choice.label}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
          </FieldGroup>
          <Alert role="status" aria-live="polite" aria-atomic="true"><AlertTitle><h4>{outcome.title}</h4></AlertTitle><AlertDescription>{outcome.body}</AlertDescription></Alert>
        </CardContent>
      </Card>

      <Separator />
      <div className="grid gap-8 pt-10 sm:pt-14 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
        <p className="font-heading max-w-lg text-3xl leading-tight sm:text-4xl">{copy.limits[0]}</p>
        <div className="flex flex-col gap-5 text-sm leading-7 sm:text-base sm:leading-8">{copy.limits.slice(1).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      </div>

      <Card className="mt-14 sm:mt-20">
        <CardHeader><CardTitle><h3>{copy.closing.title}</h3></CardTitle><CardDescription>{copy.closing.body}</CardDescription></CardHeader>
        <CardFooter><Button role="link" nativeButton={false} render={<Link href={startHref} />} size="lg" className="min-h-11 px-5">{copy.closing.cta}<ArrowUpRight aria-hidden="true" data-icon="inline-end" /></Button></CardFooter>
      </Card>
    </div>
  </section>;
}
