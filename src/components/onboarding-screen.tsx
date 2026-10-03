"use client";

// Onboarding: shown only while a required step is still open, so a configured
// install never sees it again. The screen's job is to get one X credential in,
// and it offers the three ways that actually get used in practice:
//
//   API key    project bearer token, pasted — read-only, fastest
//   Token      a user access token pasted by hand — works immediately, no redirect
//   OAuth      the real flow: client credentials plus an X authorisation
//
// All three end at the same place, so the tabs are not a mode picker — they are
// three routes to one outcome, and the screen says which one is needed for what.

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CircleAlert, KeyRound, Link2, Loader2, LogOut, Plug, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  required: boolean;
  detail?: string;
};

type Status = {
  steps: OnboardingStep[];
  incomplete: boolean;
  outstanding: string[];
};

type Verify = { ok: boolean; mode: string | null; identity: string; detail: string };

const TABS = [
  { id: "bearer", label: "API key", icon: KeyRound },
  { id: "token", label: "Token", icon: Link2 },
  { id: "oauth", label: "OAuth", icon: ShieldCheck },
] as const;

export function OnboardingScreen({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("bearer");
  const [bearer, setBearer] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/onboarding/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
  }, []);

  // The screen disappears once nothing required is left, so poll briefly after a
  // successful connect: the credential may have been saved but still be failing
  // its live check, and the operator should see that instead of a blank panel.
  useEffect(() => {
    if (status.incomplete) return;
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [status.incomplete, refresh]);

  async function connect(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    setVerify(null);
    try {
      const response = await fetch("/api/onboarding/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        setError(result.error || "bağlantı kurulamadı");
        return;
      }
      if (result.authorizeUrl) {
        window.open(result.authorizeUrl, "_blank", "noopener,noreferrer");
        setError("X'de yetkilendir, sonra geri dön ve bağlantıyı test et.");
      }
      if (result.status) setStatus((prev) => ({ ...prev }));
      await refresh();
      await runVerify();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "bağlantı kurulamadı");
    } finally {
      setBusy(null);
    }
  }

  async function runVerify() {
    setBusy("verify");
    try {
      const response = await fetch("/api/onboarding/status", { method: "POST" });
      const result = await response.json();
      setVerify(result);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("clear");
    try {
      const response = await fetch("/api/onboarding/connect", { method: "DELETE" });
      const result = await response.json();
      if (result.status) setVerify(result.verify || null);
      setBearer("");
      setAccessToken("");
      setRefreshToken("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <header className="space-y-2">
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="size-3" aria-hidden />
          İlk kurulum
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">X bağlantısını kur</h1>
        <p className="text-muted-foreground">
          Panel X&apos;e bağlanmadan yayınlayamaz. Üç yoldan birini seç — hepsi aynı yere bağlanır.
        </p>
      </header>

      <ol className="flex flex-col gap-2">
        {status.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            data-step={step.id}
            data-done={step.done ? "true" : "false"}
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border">
              {step.done ? <Check className="size-3" aria-hidden /> : <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {step.title}
                {step.required && !step.done ? <Badge variant="secondary">gerekli</Badge> : null}
              </span>
              <span className="block text-xs text-muted-foreground">{step.detail || step.description}</span>
            </span>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4" aria-hidden />
            Bağlantı yöntemi
          </CardTitle>
          <CardDescription>
            API key okuma yapar. Yayınlamak için token ya da OAuth gerekir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              {TABS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="gap-1.5">
                  <item.icon className="size-3.5" aria-hidden />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="bearer" className="mt-5 space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-bearer">Bearer token</FieldLabel>
                  <FieldDescription>
                    X developer portal → Project → Keys → Bearer Token. Yalnızca okuma; yayınlama açmaz.
                  </FieldDescription>
                  <FieldContent className="flex gap-2">
                    <Input
                      id="ob-bearer"
                      type="password"
                      autoComplete="off"
                      placeholder="AAAAAAAA…"
                      value={bearer}
                      onChange={(event) => setBearer(event.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={!bearer.trim() || busy !== null}
                      onClick={() => connect({ method: "bearer", value: bearer }, "bearer")}
                    >
                      {busy === "bearer" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Bağlan"}
                    </Button>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="token" className="mt-5 space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ob-access-token">Access token</FieldLabel>
                  <FieldDescription>
                    Elinde hazır bir kullanıcı token&apos;ı varsa yapıştır — OAuth ekranına gerek yok.
                  </FieldDescription>
                  <FieldContent className="flex gap-2">
                    <Input
                      id="ob-access-token"
                      type="password"
                      autoComplete="off"
                      placeholder="Access token"
                      value={accessToken}
                      onChange={(event) => setAccessToken(event.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={!accessToken.trim() || busy !== null}
                      onClick={() => connect({ method: "oauth-manual", value: accessToken, refreshToken }, "token")}
                    >
                      {busy === "token" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Bağlan"}
                    </Button>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ob-refresh-token">Refresh token (isteğe bağlı)</FieldLabel>
                  <FieldDescription>Verilirse token süresi dolduğunda otomatik yenilenir.</FieldDescription>
                  <FieldContent>
                    <Input
                      id="ob-refresh-token"
                      type="password"
                      autoComplete="off"
                      placeholder="Refresh token"
                      value={refreshToken}
                      onChange={(event) => setRefreshToken(event.target.value)}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </TabsContent>

            <TabsContent value="oauth" className="mt-5 space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>OAuth 2.0 client</FieldLabel>
                  <FieldDescription>
                    X developer portal → Project → OAuth 2.0. İki değer de gerekli.
                  </FieldDescription>
                  <FieldContent className="space-y-2">
                    <div className="space-y-1">
                      <FieldLabel htmlFor="ob-client-id">Client ID</FieldLabel>
                      <div className="flex gap-2">
                        <Input
                          id="ob-client-id"
                          type="password"
                          autoComplete="off"
                          placeholder="Client ID"
                          value={clientId}
                          onChange={(event) => setClientId(event.target.value)}
                        />
                        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => connect({ method: "oauth-client", clientId, clientSecret }, "client")}>
                          {busy === "client" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Kaydet"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <FieldLabel htmlFor="ob-client-secret">Client secret</FieldLabel>
                      <Input
                        id="ob-client-secret"
                        type="password"
                        autoComplete="off"
                        placeholder="Client secret"
                        value={clientSecret}
                        onChange={(event) => setClientSecret(event.target.value)}
                      />
                    </div>
                  </FieldContent>
                </Field>
                <Button
                  type="button"
                  disabled={!clientId.trim() || !clientSecret.trim() || busy !== null}
                  onClick={() => connect({ method: "oauth-client", clientId, clientSecret }, "client")}
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  Client&apos;ı kaydet ve X&apos;de yetkilendir
                </Button>
              </FieldGroup>
            </TabsContent>
          </Tabs>

          {error ? (
            <Alert variant="destructive" className="mt-4">
              <CircleAlert className="size-4" aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {verify ? (
            <Alert variant={verify.ok ? "default" : "destructive"} className="mt-4">
              <AlertTitle>{verify.ok ? `Bağlı${verify.identity ? ` — ${verify.identity}` : ""}` : "Bağlantı başarısız"}</AlertTitle>
              <AlertDescription>{verify.detail}</AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={runVerify}>
              {busy === "verify" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              Bağlantıyı test et
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={disconnect}>
              {busy === "clear" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
              Bağlantıyı sil
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}