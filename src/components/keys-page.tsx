"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { KeyRound, LockKeyhole, Save, Trash2 } from "lucide-react";
import { AiIcon } from "@/components/ai-icon";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useUiText } from "@/i18n/ui-client";

type KeyMeta = { name: string; provider: string; configured: boolean; masked: string; updatedAt: number };
type AiProvider = "api" | "compatible" | "codex" | "anthropic" | "chatgpt" | "openrouter";
type AiPanel = {
  enabled: boolean;
  runtimeAvailable?: boolean;
  settings: { provider: AiProvider; model: string };
  configured: boolean;
  apiConfigured: boolean;
  anthropicConfigured: boolean;
  chatgpt: { connected: boolean; available: boolean; email: string | null };
  compatibleConfigured: boolean;
  openrouterConfigured: boolean;
  compatible: { baseUrl: string; name: string };
  models: Record<AiProvider, readonly string[]>;
  codex: { available: boolean; authenticated: boolean; bin: string; version: string; reason?: string };
  codexAllowed: boolean;
  compatibleCapabilityVerified: boolean;
  budget: { dailyBudgetUsd: number; monthlyBudgetUsd: number; dailyCommittedUsd: number; monthlyCommittedUsd: number; pendingReservations: number };
  usage: { estimatedUsd: number; reportedUsd: number; unknownCostEvents: number; inputTokens: number; outputTokens: number };
};

export function KeysPage({ initialKeys, initialVaultReady, initialAi }: { initialKeys: KeyMeta[]; initialVaultReady: boolean; initialAi: AiPanel }) {
  const { t, locale } = useUiText();
  const [keys, setKeys] = useState<KeyMeta[]>(initialKeys);
  const [vaultReady, setVaultReady] = useState(initialVaultReady);
  const [ai, setAi] = useState(initialAi);
  const [aiProvider, setAiProvider] = useState<AiProvider>(initialAi.settings.provider);
  const [aiModel, setAiModel] = useState(initialAi.settings.model);
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState(initialAi.compatible.baseUrl);
  const [compatibleName, setCompatibleName] = useState(initialAi.compatible.name);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState(String(initialAi.budget.dailyBudgetUsd));
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState(String(initialAi.budget.monthlyBudgetUsd));
  const [pending, setPending] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [chatgptModels, setChatgptModels] = useState<string[]>([]);
  const [arena, setArena] = useState<{ available: boolean; models: Array<{ rank: number; name: string; organization: string; rating: number; votes: number; updatedAt: string }>; updatedAt: string | null }>({ available: false, models: [], updatedAt: null });
  const [jev, setJev] = useState<{ mode: "off" | "shadow" | "on"; provider: string; configured: boolean; keyConfigured: boolean }>({ mode: "off", provider: "openrouter", configured: false, keyConfigured: false });
  const [jevPending, setJevPending] = useState(false);

  useEffect(() => {
    const connectionResult = new URLSearchParams(window.location.search).get("openrouter");
    if (connectionResult) window.history.replaceState({}, "", window.location.pathname);
    void fetch("/api/settings/ai/arena", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((body) => { if (body) setArena(body); }).catch(() => undefined);
    void fetch("/api/settings/jev", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((body) => { if (body?.settings) setJev({ mode: body.settings.mode, provider: body.settings.provider, configured: body.configured, keyConfigured: body.keyConfigured }); }).catch(() => undefined);
  }, []);

  async function chatgptConnection(method: "POST" | "DELETE" | "GET") {
    setPending("chatgpt");
    setMessage("");
    try {
      const response = await fetch("/api/settings/chatgpt", { method });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("ChatGPT connection was not changed."));
      if (method === "POST") {
        const url = new URL(body.authorizationUrl);
        if (url.origin !== "https://auth.openai.com") throw new Error(t("The connection address could not be verified."));
        setAuthorizationUrl(url.toString());
      } else {
        setAuthorizationUrl("");
        setMessage(method === "DELETE" ? (body.revocationConfirmed ? t("ChatGPT connection removed.") : t("The connection was removed from this app. Check the provider-side permission in your ChatGPT settings.")) : body.connected ? t("ChatGPT account connected.") : t("Authorization is not complete yet."));
      }
      await loadAi();
      if (body.connected) {
        const modelsResponse = await fetch("/api/settings/chatgpt/models", { cache: "no-store" });
        const models = await modelsResponse.json();
        if (modelsResponse.ok) setChatgptModels(models.models || []);
        else setMessage(models.error || t("Could not load the model list."));
      }
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("ChatGPT connection could not be completed. Try again."));
    } finally { setPending(""); }
  }

  async function load() {
    const body = await fetch("/api/settings/keys", { cache: "no-store" }).then((response) => response.json());
    setKeys(body.keys || []);
    setVaultReady(body.vaultReady === true);
  }

  async function loadAi() {
    const response = await fetch("/api/settings/ai", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as AiPanel;
    setAi(body);
    setAiProvider(body.settings.provider);
    setAiModel(body.settings.model);
    setCompatibleBaseUrl(body.compatible.baseUrl);
    setCompatibleName(body.compatible.name);
    setDailyBudgetUsd(String(body.budget.dailyBudgetUsd));
    setMonthlyBudgetUsd(String(body.budget.monthlyBudgetUsd));
  }

  async function save(key: KeyMeta) {
    setPending(key.name);
    const response = await fetch(`/api/settings/keys/${key.name}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: values[key.name] || "" }) });
    setPending("");
    setMessage(response.ok ? t("{provider} connection details were saved securely.", { provider: t(key.provider) }) : t("Could not save the value. Check what you entered and try again."));
    if (response.ok) {
      setValues((current) => ({ ...current, [key.name]: "" }));
      await load();
      await loadAi();
    }
  }

  async function remove(key: KeyMeta) {
    setPending(key.name);
    try {
      const response = await fetch(`/api/settings/keys/${key.name}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || t("Could not remove the key."));
      setMessage(t("{provider} key removed.", { provider: t(key.provider) }));
      await load();
      await loadAi();
    } catch (error) {
      setMessage(error instanceof Error ? t(error.message) : t("Could not remove the key. Try again."));
    } finally { setPending(""); }
  }

  async function saveAi() {
    setConnectionMessage("");
    setPending("ai");
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: aiProvider, model: aiModel, compatibleBaseUrl, compatibleName, dailyBudgetUsd: Number(dailyBudgetUsd), monthlyBudgetUsd: Number(monthlyBudgetUsd) }),
    });
    setPending("");
    setMessage(response.ok ? t("{provider} runtime saved.", { provider: t(aiProvider === "codex" ? "Codex" : aiProvider === "compatible" ? "Custom provider" : aiProvider === "chatgpt" ? "ChatGPT" : aiProvider === "anthropic" ? "Claude API" : aiProvider === "openrouter" ? "OpenRouter" : "OpenAI API") }) : t("Could not save AI settings. Check your selection and try again."));
    if (response.ok) await loadAi();
  }

  async function testConnection() {
    setPending("connection-test");
    setConnectionMessage("");
    try {
      const response = await fetch("/api/settings/ai/test", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) {
        setConnectionMessage(t("Connection verified: {provider}:{model}.", { provider: body.provider, model: body.model }));
        await loadAi();
      } else if (body.error === "unsupported_model_or_task") {
        setConnectionMessage(t("This model does not support the structured JSON response task."));
      } else if (body.error === "provider_unavailable") {
        setConnectionMessage(t("The selected provider is not available for this account."));
      } else if (body.error === "unknown_cost_under_budget") {
        setConnectionMessage(t("This provider does not report request costs, so I cannot safely enforce the active USD limit. Turn off the limit or choose a provider that reports costs."));
      } else if (body.error === "budget_limit") {
        setConnectionMessage(t("The daily or monthly AI budget limit does not allow this request."));
      } else {
        setConnectionMessage(t("Connection test failed. Check the saved provider settings and key."));
      }
    } catch {
      setConnectionMessage(t("Connection test failed. Check the saved provider settings and key."));
    } finally {
      setPending("");
    }
  }

  async function setAiEnabled(enabled: boolean) {
    setPending("ai-enabled");
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setPending("");
    setMessage(response.ok ? t("AI usage {state}.", { state: t(enabled ? "enabled" : "disabled") }) : t("AI status was not changed. Try again."));
    if (response.ok) await loadAi();
  }

  async function openrouterConnection(method: "POST" | "DELETE") {
    setPending("openrouter"); setMessage("");
    try {
      const response = await fetch("/api/settings/openrouter", { method });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t("Could not start the OpenRouter connection. Try again."));
      if (method === "POST") {
        const target = new URL(body.authorizationUrl);
        if (target.origin !== "https://openrouter.ai") throw new Error(t("The connection address could not be verified."));
        window.location.assign(target.toString()); return;
      }
      setMessage(t("The ispatla.tr connection was removed. You can also revoke the provider-side key from your OpenRouter account.")); await loadAi();
    } catch (error) { setMessage(error instanceof Error ? t(error.message) : t("OpenRouter connection was not changed.")); }
    finally { setPending(""); }
  }

  async function saveJev(mode: "off" | "shadow" | "on") {
    setJevPending(true);
    try {
      const response = await fetch("/api/settings/jev", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openrouter", model: "typesafe/jev-1.13", mode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("Could not save Jev settings."));
      setJev({ mode: body.settings.mode, provider: body.settings.provider, configured: body.configured, keyConfigured: body.keyConfigured });
      setMessage(mode === "off" ? t("Jev turned off.") : mode === "shadow" ? t("Jev is in shadow mode: scores do not affect publishing decisions.") : t("Jev enabled."));
    } catch (error) { setMessage(error instanceof Error ? t(error.message) : t("Could not save Jev settings.")); }
    finally { setJevPending(false); }
  }

  const aiModels = aiProvider === "chatgpt" ? chatgptModels : ai.models[aiProvider] || [];
  const compatibleCredentialsReady = Boolean(ai.compatibleConfigured && compatibleBaseUrl && aiModel);
  const aiReady = aiProvider === "codex" ? ai.codexAllowed && ai.codex.authenticated : aiProvider === "chatgpt" ? ai.chatgpt.connected : aiProvider === "compatible" ? Boolean(compatibleCredentialsReady && ai.compatibleCapabilityVerified) : aiProvider === "anthropic" ? ai.anthropicConfigured : aiProvider === "openrouter" ? ai.openrouterConfigured : ai.apiConfigured;
  const selectedSettingsAreSaved = ai.settings.provider === aiProvider
    && ai.settings.model === aiModel
    && (aiProvider !== "compatible" || (ai.compatible.baseUrl === compatibleBaseUrl && ai.compatible.name === compatibleName));
  const canTestConnection = selectedSettingsAreSaved && (aiProvider === "compatible" ? compatibleCredentialsReady : aiReady) && pending === "";
  const providerCards: Array<{ id: AiProvider; name: string; detail: string; brand?: string; ready: boolean; disabled?: boolean }> = [
    { id: "openrouter", name: "OpenRouter", detail: "Connect your account ⁜ choose models in one place", brand: "/brand/openrouter.svg", ready: ai.openrouterConfigured, disabled: ai.runtimeAvailable === false },
    { id: "api", name: "OpenAI API", detail: "Use your own API key", brand: "/brand/openai.svg", ready: ai.apiConfigured, disabled: ai.runtimeAvailable === false },
    { id: "anthropic", name: "Claude API", detail: "Use your own Console key", brand: "/brand/anthropic.svg", ready: ai.anthropicConfigured, disabled: ai.runtimeAvailable === false },
    { id: "chatgpt", name: "ChatGPT", detail: ai.chatgpt.available ? "Connect your account" : "Not available on this server", brand: "/brand/openai.svg", ready: ai.chatgpt.connected, disabled: !ai.chatgpt.available },
    { id: "compatible", name: "Custom provider", detail: "OpenAI-compatible service", ready: ai.compatibleConfigured, disabled: ai.runtimeAvailable === false },
    ...(ai.codexAllowed ? [{ id: "codex" as const, name: "Codex", detail: "Local session on this server", ready: ai.codex.authenticated }] : []),
  ];
  const providerName = t(providerCards.find((provider) => provider.id === aiProvider)?.name || "AI provider");
  function chooseProvider(provider: AiProvider) {
    setAiProvider(provider);
    setAiModel(provider === "chatgpt" ? chatgptModels[0] || "" : ai.models[provider][0] || "");
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert variant={vaultReady ? "default" : "destructive"}>
        <LockKeyhole aria-hidden="true" />
        <AlertDescription>
          {vaultReady ? t("Connection details are stored in a secure vault; secret values are not shown on this screen.") : t("The secure connection vault is not ready yet. Contact the server administrator.")}
        </AlertDescription>
        <AlertAction><Badge variant={vaultReady ? "default" : "destructive"}>{vaultReady ? t("Ready") : t("Not configured")}</Badge></AlertAction>
      </Alert>
      {ai.runtimeAvailable === false && <Alert variant="destructive"><AlertDescription>{t("AI provider connections and usage tests are unavailable until the PostgreSQL migration is complete. You can save keys securely, but AI requests will not run yet.")}</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle>{t("Use your own account")}</CardTitle><CardDescription>{t("Connect your OpenAI or Claude API key below. In a local installation, you can also authorize your ChatGPT plan directly.")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{ai.chatgpt.connected ? t("ChatGPT connected{email}", { email: ai.chatgpt.email ? ` ⁜ ${ai.chatgpt.email}` : "" }) : t("ChatGPT account is not connected.")}</p>
          {ai.chatgpt.available ? <div className="flex flex-wrap gap-2">
            <Button onClick={() => void chatgptConnection("POST")} disabled={pending !== "" || Boolean(authorizationUrl)}>{t("Start ChatGPT connection")}</Button>
            <Button variant="outline" onClick={() => void chatgptConnection("GET")} disabled={pending !== ""}>{t("Refresh connection and models")}</Button>
            {(ai.chatgpt.connected || authorizationUrl) && <Button variant="ghost" onClick={() => void chatgptConnection("DELETE")} disabled={pending !== ""}>{ai.chatgpt.connected ? t("Remove connection") : t("Cancel connection")}</Button>}
          </div> : <p className="text-sm text-muted-foreground">{t("ChatGPT subscription connections are not available on this server. You can use your own OpenAI API key.")}</p>}
          {authorizationUrl && <div className="space-y-2"><a href={authorizationUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">{t("Continue with ChatGPT")}</a><p className="text-sm text-muted-foreground">{t("Complete authorization on the OpenAI page, then refresh the connection here. The connection page remains open for 5 minutes.")}</p></div>}
          <p className="text-sm text-muted-foreground">{t("Connect Claude with your own Console API key. A Claude chat subscription does not cover this app’s API costs.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border bg-background p-2"><Image src="/brand/openrouter.svg" alt="" width={28} height={28} className="size-full" /></div>
          <div className="flex-1"><CardTitle>OpenRouter</CardTitle><CardDescription>{t("Use models with your OpenRouter account. The same connection can be used for Jev evaluations.")}</CardDescription></div>
          <Badge variant={ai.openrouterConfigured ? "default" : "secondary"}>{ai.openrouterConfigured ? t("Connected") : t("Not connected")}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void openrouterConnection("POST")} disabled={pending !== "" || ai.openrouterConfigured || ai.runtimeAvailable === false}>{pending === "openrouter" ? <Spinner data-icon="inline-start" /> : null}{t("Connect OpenRouter account")}</Button>
          {ai.openrouterConfigured && <Button variant="outline" onClick={() => void openrouterConnection("DELETE")} disabled={pending !== "" || ai.runtimeAvailable === false}>{t("Remove connection")}</Button>}
          <p className="w-full text-sm text-muted-foreground">{t("After approval, the key is kept in the secure vault. Requests are sent to OpenRouter and may be charged to your account.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AiIcon size={20} />
            <div>
              <CardTitle>{t("AI provider and model")}</CardTitle>
          <CardDescription>{t("Connect your account, choose a model, and verify the connection.")}</CardDescription>
            </div>
          </div>
          <Badge variant={!ai.enabled ? "secondary" : aiReady ? "default" : "destructive"}>{!ai.enabled ? t("Off") : aiReady ? t("Ready") : aiProvider === "codex" ? t("Sign-in required") : t("Connection required")}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>{t("Choose a provider")}</FieldLabel>
              <div role="group" aria-label={t("AI provider")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {providerCards.map((provider) => <button key={provider.id} type="button" aria-pressed={aiProvider === provider.id} disabled={provider.disabled} onClick={() => chooseProvider(provider.id)} className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${aiProvider === provider.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-accent/40"}`}>
                  {provider.brand ? <Image src={provider.brand} alt="" width={28} height={28} className="size-7 shrink-0" /> : <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md border text-xs font-semibold">{provider.id === "compatible" ? "API" : "C"}</span>}
                  <span className="min-w-0 flex-1"><span className="block font-medium">{t(provider.name)}</span><span className="block truncate text-xs text-muted-foreground">{t(provider.detail)}</span></span>
                  <span className={`size-2 shrink-0 rounded-full ${provider.ready ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-label={provider.ready ? t("Connected") : t("Not connected")} />
                </button>)}
              </div>
              <FieldDescription>{t("Selected: {provider}{detail}", { provider: providerName, detail: aiProvider === "compatible" ? t(" ⁜ Requires an HTTPS endpoint that supports Chat Completions and JSON Schema.") : aiProvider === "openrouter" ? t(" ⁜ Your OpenRouter connection and usage charges apply.") : aiProvider === "chatgpt" ? t(" ⁜ Models available to your account appear after refreshing the connection.") : aiProvider === "anthropic" ? t(" ⁜ Uses Claude Console API; chat subscriptions do not cover API usage.") : aiProvider === "codex" ? t(" ⁜ Uses a local session permitted on this server only.") : t(" ⁜ Your personal API key is read from the secure vault.") })}</FieldDescription>
            </Field>
            {aiProvider === "compatible" && <>
              <Field>
                <FieldLabel htmlFor="compatible-name">{t("Provider name")}</FieldLabel>
                <Input id="compatible-name" value={compatibleName} onChange={(event) => setCompatibleName(event.target.value)} maxLength={80} placeholder={t("OpenRouter, Groq, local gateway…")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="compatible-base-url">{t("API base URL")}</FieldLabel>
                <Input id="compatible-base-url" value={compatibleBaseUrl} onChange={(event) => setCompatibleBaseUrl(event.target.value)} inputMode="url" placeholder="https://api.example.com/v1" />
                <FieldDescription>{t("Must use HTTPS; the app automatically adds `/chat/completions`.")}</FieldDescription>
              </Field>
            </>}
            <Field>
              <FieldLabel>{aiProvider === "compatible" ? t("Model ID") : t("Choose a model")}</FieldLabel>
              {aiProvider === "compatible" ? <Input id="ai-model" value={aiModel} onChange={(event) => setAiModel(event.target.value)} maxLength={160} placeholder={t("Provider model name")} /> : <div role="radiogroup" aria-label={t("{provider} model", { provider: providerName })} className="grid gap-2 sm:grid-cols-2">
                {aiModels.map((model) => <button key={model} type="button" aria-pressed={aiModel === model} onClick={() => setAiModel(model)} className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${aiModel === model ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}><span className="min-w-0 truncate text-sm font-medium">{model}</span><span aria-hidden="true" className={`size-4 shrink-0 rounded-full border ${aiModel === model ? "border-[5px] border-primary" : "border-muted-foreground/40"}`} /></button>)}
              </div>}
              <FieldDescription>{t("Verify models by testing the connection with your own content. A second opinion or cost varies by provider and selected model.")}</FieldDescription>
            </Field>
          </FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ai-enabled">{t("Allow AI usage")}</FieldLabel>
              <FieldDescription>{t("When off, no new scoring, draft, or discovery-query calls are made. Manual text entry continues to work.")}</FieldDescription>
            </FieldContent>
            <Switch id="ai-enabled" checked={ai.enabled} onCheckedChange={(value) => void setAiEnabled(value)} disabled={pending !== ""} />
          </Field>
          <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">{t("Usage and limits")}</summary>
          <section className="mt-4 grid gap-4 sm:grid-cols-2" aria-label={t("AI usage thresholds")}>
            <Field>
              <FieldLabel htmlFor="ai-daily-budget">{t("Estimated daily usage limit (USD)")}</FieldLabel>
              <Input id="ai-daily-budget" type="number" min="0" max="1000000" step="any" value={dailyBudgetUsd} onChange={(event) => setDailyBudgetUsd(event.target.value)} />
              <FieldDescription>{t("A value of 0 means unlimited. The daily period resets at UTC midnight; this is not a hard billing limit.")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-monthly-budget">{t("Estimated monthly usage limit (USD)")}</FieldLabel>
              <Input id="ai-monthly-budget" type="number" min="0" max="1000000" step="any" value={monthlyBudgetUsd} onChange={(event) => setMonthlyBudgetUsd(event.target.value)} />
              <FieldDescription>{t("A value of 0 means unlimited. The monthly period resets at the start of the UTC month; this is not a hard billing limit.")}</FieldDescription>
            </Field>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t("Reserved estimated usage: daily ${dailyUsed} / {dailyLimit}; monthly ${monthlyUsed} / {monthlyLimit}. Open or uncertain requests: {pending}. API/Codex reservations use a fixed per-call estimate, not the provider’s actual bill. The cost of a key-based compatible provider is unknown unless the provider reports it; with a limit enabled, these requests are safely blocked.", { dailyUsed: new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(ai.budget.dailyCommittedUsd), dailyLimit: ai.budget.dailyBudgetUsd ? `$${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ai.budget.dailyBudgetUsd)}` : t("unlimited"), monthlyUsed: new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(ai.budget.monthlyCommittedUsd), monthlyLimit: ai.budget.monthlyBudgetUsd ? `$${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ai.budget.monthlyBudgetUsd)}` : t("unlimited"), pending: new Intl.NumberFormat(locale).format(ai.budget.pendingReservations) })}
            </p>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t("This month: provider reported ${reported}, app estimated ${estimated}, {unknown} calls with unknown cost; {input} input and {output} output tokens. The estimate is not the actual bill.", { reported: new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(ai.usage.reportedUsd), estimated: new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(ai.usage.estimatedUsd), unknown: new Intl.NumberFormat(locale).format(ai.usage.unknownCostEvents), input: new Intl.NumberFormat(locale).format(ai.usage.inputTokens), output: new Intl.NumberFormat(locale).format(ai.usage.outputTokens) })}
            </p>
          </section>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveAi} disabled={!aiModel || pending !== "" || ai.runtimeAvailable === false || (aiProvider === "codex" && !ai.codexAllowed)}>
              {pending === "ai" ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} {t("Save AI settings")}
            </Button>
            <Button variant="outline" onClick={() => void testConnection()} disabled={!canTestConnection || ai.runtimeAvailable === false}>
              {pending === "connection-test" ? <Spinner data-icon="inline-start" /> : <AiIcon size={16} className="mr-2" />} {t("Test connection")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("The test sends one small structured-response request using the saved provider and key. The provider may charge for it.")}</p>
          {!selectedSettingsAreSaved && <p className="text-sm text-muted-foreground">{t("Save the selected provider, model, and endpoint settings before testing the connection.")}</p>}
          {connectionMessage && <Alert variant={connectionMessage.startsWith(t("Connection verified:")) ? "default" : "destructive"}><AlertDescription>{connectionMessage}</AlertDescription></Alert>}
          {ai.enabled && !aiReady && <Alert variant="destructive"><AlertDescription>{aiProvider === "codex" ? (ai.codexAllowed ? t("The local Codex session is not ready. Sign in and try again.") : t("The shared Codex session is not available for production user accounts. Connect your own API key.")) : aiProvider === "compatible" ? compatibleCredentialsReady ? t("Successfully test the connection before using the custom provider model.") : t("An HTTPS endpoint, model, and OpenAI-compatible AI API key are required.") : aiProvider === "chatgpt" ? t("Connect your own ChatGPT account above first.") : aiProvider === "anthropic" ? t("Save your Claude key in the advanced connections section.") : aiProvider === "openrouter" ? t("Connect your OpenRouter account above first.") : t("Save your OpenAI API key in the advanced connections section.")}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Compare models before choosing")}</CardTitle>
          <CardDescription>{t("Review Arena’s controlled ranking of writing style, then test connection and quality with your own content. The ranking does not guarantee success on ispatla.tr.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {arena.available ? <>
            <p className="text-sm text-muted-foreground">{t("The server regularly refreshes Hugging Face Arena’s verified ranking{updatedAt}. Arena names do not always match provider model IDs; this ranking is for comparison.", { updatedAt: arena.updatedAt ? ` ⁜ ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(arena.updatedAt))}` : "" })}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {arena.models.map((model) => <article key={`${model.rank}-${model.name}`} className="flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-semibold tabular-nums">{model.rank}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{model.name}</span><span className="block text-sm text-muted-foreground">{model.organization} ⁜ {t("{count} votes", { count: new Intl.NumberFormat(locale).format(model.votes) })}</span></span>
                <span className="text-right"><span className="block font-semibold tabular-nums">{model.rating.toFixed(1)}</span><span className="text-xs text-muted-foreground">Arena</span></span>
              </article>)}
            </div>
          </> : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("Arena ranking is unavailable right now. Try again later.")}</p>}
          <a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">{t("View the Arena dataset")}</a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border font-semibold tracking-tight">Jev</div>
          <div className="flex-1"><CardTitle>{t("Jev evaluation")}</CardTitle><CardDescription>{t("Use your OpenRouter connection to add scores to source matches. No separate key is needed.")}</CardDescription></div>
          <Badge variant={jev.configured ? "default" : "secondary"}>{jev.mode === "off" ? t("Off") : jev.configured ? (jev.mode === "shadow" ? t("Shadow") : t("On")) : t("Waiting for connection")}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t("Jev operating mode")} className="flex flex-wrap gap-2">
            {([ ["off", t("Off")], ["shadow", t("Shadow")], ["on", t("On")] ] as const).map(([mode, label]) => <Button key={mode} type="button" variant={jev.mode === mode ? "default" : "outline"} aria-pressed={jev.mode === mode} onClick={() => void saveJev(mode)} disabled={jevPending || (mode !== "off" && !ai.openrouterConfigured)}>{label}</Button>)}
          </div>
          {jevPending && <Spinner aria-label={t("Saving Jev settings")} />}
          <p className="w-full text-sm text-muted-foreground">{t("Shadow mode stores results for evaluation only. Enabling it may add costs; Jev does not make publishing or account security decisions by itself.")}</p>
        </CardContent>
      </Card>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">{t("Advanced API keys")}</summary>
        <p className="my-3 text-sm text-muted-foreground">{t("Save an API key from OpenAI, Claude, or a compatible provider. The key is visible only while you enter it.")}</p>
        <div className="space-y-4">
      {keys.map((key) => (
        <Card key={key.name}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {key.provider === "OpenAI" ? <Image src="/brand/openai.svg" alt="OpenAI" width={24} height={24} /> : key.provider === "Claude" ? <Image src="/brand/anthropic.svg" alt="Anthropic" width={24} height={24} /> : <KeyRound aria-hidden="true" />}
              <div>
                <CardTitle>{t(key.provider)}</CardTitle>
                <CardDescription>{key.configured ? t("Key saved") : t("Not connected yet")}</CardDescription>
              </div>
            </div>
            <Badge variant={key.configured ? "secondary" : "outline"}>{key.configured ? t("Connected") : t("Not connected")}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={key.name}>{t("New value")}</FieldLabel>
              <FieldDescription>{t("The value is saved only in the server-side vault and is never shown again in the interface.")}</FieldDescription>
              <Input id={key.name} type="password" autoComplete="new-password" value={values[key.name] || ""} onChange={(event) => setValues((current) => ({ ...current, [key.name]: event.target.value }))} placeholder="••••••••" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(key)} disabled={!values[key.name] || pending !== ""}>
                {pending === key.name ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} {t("Update")}
              </Button>
              {key.configured && (
                <Button variant="destructive" onClick={() => remove(key)} disabled={pending !== ""}>
                  {pending === key.name ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />} {t("Remove")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
        </div>
      </details>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
