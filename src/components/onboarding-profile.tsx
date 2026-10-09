"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { AppearanceSettings } from "@/components/appearance-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnUserProfile } from "@/server/db";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type Step = "profile" | "x" | "ai" | "appearance";
const STEP_ORDER: Step[] = ["profile", "x", "ai", "appearance"];

export function onboardingStepFromStorage(value: string | null): Step {
  return STEP_ORDER.includes(value as Step) ? value as Step : "profile";
}

export function OnboardingProfile({ initial, locale }: { initial: OwnUserProfile; locale: Locale }) {
  const router = useRouter();
  const copy = getDictionary(locale).onboarding;
  const steps: { id: Step; title: string; detail: string }[] = [
    { id: "profile", title: copy.stepProfile, detail: copy.stepProfileDetail },
    { id: "x", title: copy.stepX, detail: copy.stepXDetail },
    { id: "ai", title: copy.stepAi, detail: copy.stepAiDetail },
    { id: "appearance", title: copy.stepAppearance, detail: copy.stepAppearanceDetail },
  ];
  const [profile, setProfile] = useState(initial);
  const [visibility, setVisibility] = useState<"private" | "public">(initial.visibility);
  const [profileSaved, setProfileSaved] = useState(initial.onboardingCompleted === true);
  const [xConnected, setXConnected] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [step, setStep] = useState<Step>("profile");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore optional, non-authoritative wizard position after hydration.
    try { setStep(onboardingStepFromStorage(window.localStorage.getItem("ispatla-onboarding-step"))); }
    catch { /* private browsing can deny storage; onboarding remains available at the first step */ }
    const loadStatus = async () => {
      const [accountsResponse, aiResponse] = await Promise.all([
        fetch("/api/x/accounts", { cache: "no-store" }),
        fetch("/api/settings/ai", { cache: "no-store" }),
      ]);
      if (accountsResponse.ok) {
        const body = await accountsResponse.json() as { accounts?: { connected?: boolean }[] };
        setXConnected(body.accounts?.some((account) => account.connected === true) === true);
      }
      if (aiResponse.ok) {
        const body = await aiResponse.json() as { configured?: boolean; chatgpt?: { connected?: boolean } };
        setAiReady(body.configured === true || body.chatgpt?.connected === true);
      }
    };
    void loadStatus().catch(() => undefined);
  }, []);

  function selectStep(next: Step) {
    setStep(next);
    try { window.localStorage.setItem("ispatla-onboarding-step", next); } catch { /* progress is best-effort; completion stays server-owned */ }
  }

  async function saveProfile() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: profile.displayName, bio: profile.bio, visibility }),
      });
      const body = await response.json() as OwnUserProfile & { error?: string };
      if (!response.ok) throw new Error(copy.saveFailed);
      setProfile(body);
      setProfileSaved(body.onboardingCompleted === true);
      if (!body.onboardingCompleted) throw new Error(copy.incompleteProfile);
      selectStep("x");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.message === copy.incompleteProfile ? error.message : copy.saveFailed);
    } finally { setPending(false); }
  }

  const currentIndex = STEP_ORDER.indexOf(step);
  const completed: Record<Step, boolean> = { profile: profileSaved, x: xConnected, ai: aiReady, appearance: true };
  const goNext = () => selectStep(STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)]);
  const goBack = () => selectStep(STEP_ORDER[Math.max(currentIndex - 1, 0)]);

  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex items-center justify-between gap-4"><BrandLogo href={localizePath(locale, "/")} /><Link href={localizePath(locale, "/app")} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{copy.workspaceLink}</Link></header>
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{copy.firstSteps} · {currentIndex + 1} / {STEP_ORDER.length}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.pageTitle}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{copy.pageIntro}</p></div>
      <nav aria-label={copy.stepsLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((item, index) => <button key={item.id} type="button" onClick={() => selectStep(item.id)} aria-current={step === item.id ? "step" : undefined} className={`flex min-h-16 items-start gap-2 rounded-md border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-ring ${step === item.id ? "border-primary bg-accent" : "bg-card hover:bg-accent/50"}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] ${completed[item.id] ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{completed[item.id] ? <Check aria-hidden="true" className="size-3" /> : index + 1}</span><span className="min-w-0"><strong className="block text-sm">{item.title}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span></span></button>)}</nav>

      {step === "profile" && <Card>
        <CardHeader><CardTitle>{copy.profileTitle}</CardTitle><CardDescription>{profile.xHandle ? copy.profileImportedDescription : copy.profileDescription}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4 rounded-md border p-4">{profile.avatarUrl ? <Image src={profile.avatarUrl} alt={copy.avatarAlt} width={64} height={64} unoptimized className="size-16 rounded-full object-cover" /> : <div aria-hidden="true" className="size-16 rounded-full bg-muted" />}<div><p className="font-medium">{profile.displayName || copy.addDisplayName}</p>{profile.xHandle && <p className="text-sm text-muted-foreground">@{profile.xHandle}</p>}</div></div>
          <label className="flex flex-col gap-2 text-sm">{copy.displayName}<input className="h-10 rounded-md border bg-background px-3" maxLength={80} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></label>
          <label className="flex flex-col gap-2 text-sm">{copy.bio}<textarea className="min-h-24 rounded-md border bg-background px-3 py-2" maxLength={500} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /></label>
          <fieldset className="flex flex-col gap-3 rounded-md border p-4"><legend className="px-1 text-sm font-semibold">{copy.visibility}</legend><label className="flex items-start gap-3 text-sm"><input type="radio" name="visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} /><span><strong>{copy.publicVisibility}</strong><span className="mt-1 block text-muted-foreground">{copy.publicDescription}</span></span></label><label className="flex items-start gap-3 text-sm"><input type="radio" name="visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><strong>{copy.privateVisibility}</strong><span className="mt-1 block text-muted-foreground">{copy.privateDescription}</span></span></label></fieldset>
          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <div className="flex justify-end"><Button type="button" onClick={() => void saveProfile()} disabled={pending}>{pending ? copy.saving : profileSaved ? copy.saveProfile : copy.saveAndContinue}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button></div>
        </CardContent>
      </Card>}

      {step === "x" && <Card><CardHeader><CardTitle>{copy.xTitle}</CardTitle><CardDescription>{copy.xDescription}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="flex items-center gap-3 rounded-md border p-4"><span className={`size-2.5 rounded-full ${xConnected ? "bg-emerald-500" : "bg-muted-foreground/50"}`} /><p className="text-sm">{xConnected ? copy.xConnected : copy.xNotConnected}</p></div><div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={goBack}><ArrowLeft data-icon="inline-start" aria-hidden="true" />{copy.back}</Button><div className="flex gap-2"><Button variant="outline" render={<Link href={localizePath(locale, "/app/accounts")} />}>{copy.manageAccounts}<ExternalLink data-icon="inline-end" aria-hidden="true" /></Button><Button onClick={goNext}>{copy.continue}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button></div></div></CardContent></Card>}

      {step === "ai" && <Card><CardHeader><CardTitle>{copy.aiTitle}</CardTitle><CardDescription>{copy.aiDescription}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="flex items-center gap-3 rounded-md border p-4"><Sparkles aria-hidden="true" className="size-4 text-muted-foreground" /><p className="text-sm">{aiReady ? copy.aiReady : copy.aiNotReady}</p></div><div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={goBack}><ArrowLeft data-icon="inline-start" aria-hidden="true" />{copy.back}</Button><div className="flex gap-2"><Button variant="outline" render={<Link href={localizePath(locale, "/app/settings/keys")} />}>{copy.manageProviders}<ExternalLink data-icon="inline-end" aria-hidden="true" /></Button><Button onClick={goNext}>{copy.continue}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button></div></div></CardContent></Card>}

      {step === "appearance" && <div className="flex flex-col gap-4"><AppearanceSettings locale={locale} /><div className="flex justify-between"><Button variant="outline" onClick={goBack}><ArrowLeft data-icon="inline-start" aria-hidden="true" />{copy.back}</Button><Button onClick={() => { router.push(localizePath(locale, "/app")); router.refresh(); }}>{copy.openWorkspace}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button></div></div>}
    </div>
  </main>;
}
