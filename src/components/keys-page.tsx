"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BrainCircuit, KeyRound, LockKeyhole, Save, Trash2 } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

type KeyMeta = { name: string; provider: string; configured: boolean; masked: string; updatedAt: number };
type AiProvider = "api" | "compatible" | "codex" | "anthropic" | "chatgpt" | "openrouter";
type AiPanel = {
  enabled: boolean;
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
      if (!response.ok) throw new Error(body.error || "ChatGPT bağlantısı değişmedi.");
      if (method === "POST") {
        const url = new URL(body.authorizationUrl);
        if (url.origin !== "https://auth.openai.com") throw new Error("Bağlantı adresi doğrulanamadı.");
        setAuthorizationUrl(url.toString());
      } else {
        setAuthorizationUrl("");
        setMessage(method === "DELETE" ? (body.revocationConfirmed ? "ChatGPT bağlantısı kaldırıldı." : "Bağlantı bu uygulamadan kaldırıldı. Sağlayıcı tarafındaki izni ChatGPT ayarlarından kontrol et.") : body.connected ? "ChatGPT hesabın bağlı." : "Yetkilendirme henüz tamamlanmadı.");
      }
      await loadAi();
      if (body.connected) {
        const modelsResponse = await fetch("/api/settings/chatgpt/models", { cache: "no-store" });
        const models = await modelsResponse.json();
        if (modelsResponse.ok) setChatgptModels(models.models || []);
        else setMessage(models.error || "Model listesi alınamadı.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ChatGPT bağlantısı tamamlanamadı. Tekrar dene.");
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
    setMessage(response.ok ? `${key.provider} bağlantı bilgisi güvenli biçimde kaydedildi.` : "Bilgi kaydedilemedi. Girdiğini kontrol edip yeniden dene.");
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
      if (!response.ok) throw new Error(body.error || "Anahtar kaldırılamadı.");
      setMessage(`${key.provider} anahtarı kaldırıldı.`);
      await load();
      await loadAi();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Anahtar kaldırılamadı. Tekrar dene.");
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
    setMessage(response.ok ? `${aiProvider === "codex" ? "Codex" : aiProvider === "compatible" ? "Özel sağlayıcı" : aiProvider === "chatgpt" ? "ChatGPT" : aiProvider === "anthropic" ? "Claude API" : aiProvider === "openrouter" ? "OpenRouter" : "OpenAI API"} çalıştırıcısı kaydedildi.` : "AI ayarı kaydedilemedi. Seçimini kontrol edip yeniden dene.");
    if (response.ok) await loadAi();
  }

  async function testConnection() {
    setPending("connection-test");
    setConnectionMessage("");
    try {
      const response = await fetch("/api/settings/ai/test", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) {
        setConnectionMessage(`Bağlantı doğrulandı: ${body.provider}:${body.model}.`);
        await loadAi();
      } else if (body.error === "unsupported_model_or_task") {
        setConnectionMessage("Bu model yapılandırılmış JSON yanıt görevini desteklemiyor.");
      } else if (body.error === "provider_unavailable") {
        setConnectionMessage("Seçili sağlayıcı bu hesapta kullanılamıyor.");
      } else if (body.error === "unknown_cost_under_budget") {
        setConnectionMessage("Bu sağlayıcı isteğin maliyetini bildirmiyor; etkin USD sınırını güvenli biçimde uygulayamıyorum. Sınırı kapat veya maliyeti bildiren bir sağlayıcı seç.");
      } else if (body.error === "budget_limit") {
        setConnectionMessage("Günlük veya aylık AI bütçe sınırı bu isteğe izin vermiyor.");
      } else {
        setConnectionMessage("Bağlantı testi başarısız. Kaydedilmiş sağlayıcı ayarlarını ve anahtarı kontrol et.");
      }
    } catch {
      setConnectionMessage("Bağlantı testi başarısız. Kaydedilmiş sağlayıcı ayarlarını ve anahtarı kontrol et.");
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
    setMessage(response.ok ? `AI kullanımı ${enabled ? "açıldı" : "kapatıldı"}.` : "AI durumu değişmedi. Yeniden dene.");
    if (response.ok) await loadAi();
  }

  async function openrouterConnection(method: "POST" | "DELETE") {
    setPending("openrouter"); setMessage("");
    try {
      const response = await fetch("/api/settings/openrouter", { method });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("OpenRouter bağlantısı başlatılamadı. Tekrar dene.");
      if (method === "POST") {
        const target = new URL(body.authorizationUrl);
        if (target.origin !== "https://openrouter.ai") throw new Error("Bağlantı adresi doğrulanamadı.");
        window.location.assign(target.toString()); return;
      }
      setMessage("Ispatla bağlantısı kaldırıldı. Sağlayıcı tarafındaki anahtarı OpenRouter hesabından da iptal edebilirsin."); await loadAi();
    } catch (error) { setMessage(error instanceof Error ? error.message : "OpenRouter bağlantısı değişmedi."); }
    finally { setPending(""); }
  }

  async function saveJev(mode: "off" | "shadow" | "on") {
    setJevPending(true);
    try {
      const response = await fetch("/api/settings/jev", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openrouter", model: "typesafe/jev-1.13", mode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Jev ayarı kaydedilemedi.");
      setJev({ mode: body.settings.mode, provider: body.settings.provider, configured: body.configured, keyConfigured: body.keyConfigured });
      setMessage(mode === "off" ? "Jev kapatıldı." : mode === "shadow" ? "Jev gölge modunda: puanları yayın kararını etkilemez." : "Jev etkinleştirildi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Jev ayarı kaydedilemedi."); }
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
    { id: "openrouter", name: "OpenRouter", detail: "Hesabını bağla · modelleri tek yerden seç", brand: "/brand/openrouter.svg", ready: ai.openrouterConfigured },
    { id: "api", name: "OpenAI API", detail: "Kendi API anahtarın", brand: "/brand/openai.svg", ready: ai.apiConfigured },
    { id: "anthropic", name: "Claude API", detail: "Kendi Console anahtarın", brand: "/brand/anthropic.svg", ready: ai.anthropicConfigured },
    { id: "chatgpt", name: "ChatGPT hesabı", detail: ai.chatgpt.available ? "Hesabını bağla" : "Bu sunucuda kullanılamıyor", brand: "/brand/openai.svg", ready: ai.chatgpt.connected, disabled: !ai.chatgpt.available },
    { id: "compatible", name: "Özel sağlayıcı", detail: "OpenAI uyumlu servis", ready: ai.compatibleConfigured },
    ...(ai.codexAllowed ? [{ id: "codex" as const, name: "Codex", detail: "Bu sunucunun yerel oturumu", ready: ai.codex.authenticated }] : []),
  ];
  const providerName = providerCards.find((provider) => provider.id === aiProvider)?.name || "AI sağlayıcısı";
  function chooseProvider(provider: AiProvider) {
    setAiProvider(provider);
    setAiModel(provider === "chatgpt" ? chatgptModels[0] || "" : ai.models[provider][0] || "");
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert variant={vaultReady ? "default" : "destructive"}>
        <LockKeyhole aria-hidden="true" />
        <AlertDescription>
          {vaultReady ? "Bağlantı bilgileri güvenli kasada saklanır; gizli değerler bu ekranda gösterilmez." : "Güvenli bağlantı kasası henüz hazır değil. Sunucu yöneticisiyle iletişime geç."}
        </AlertDescription>
        <AlertAction><Badge variant={vaultReady ? "default" : "destructive"}>{vaultReady ? "hazır" : "kurulmamış"}</Badge></AlertAction>
      </Alert>

      <Card>
        <CardHeader><CardTitle>Kendi hesabını kullan</CardTitle><CardDescription>OpenAI veya Claude API anahtarını aşağıdan bağlayabilirsin. Yerel kurulumda ChatGPT planına da doğrudan izin verebilirsin.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{ai.chatgpt.connected ? `ChatGPT bağlı${ai.chatgpt.email ? ` · ${ai.chatgpt.email}` : ""}` : "ChatGPT hesabı bağlı değil."}</p>
          {ai.chatgpt.available ? <div className="flex flex-wrap gap-2">
            <Button onClick={() => void chatgptConnection("POST")} disabled={pending !== "" || Boolean(authorizationUrl)}>ChatGPT bağlantısını başlat</Button>
            <Button variant="outline" onClick={() => void chatgptConnection("GET")} disabled={pending !== ""}>Bağlantıyı ve modelleri yenile</Button>
            {(ai.chatgpt.connected || authorizationUrl) && <Button variant="ghost" onClick={() => void chatgptConnection("DELETE")} disabled={pending !== ""}>{ai.chatgpt.connected ? "Bağlantıyı kaldır" : "Bağlantıyı iptal et"}</Button>}
          </div> : <p className="text-sm text-muted-foreground">Bu sunucuda ChatGPT aboneliğiyle bağlantı açılmıyor. Kendi OpenAI API anahtarını kullanabilirsin.</p>}
          {authorizationUrl && <div className="space-y-2"><a href={authorizationUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Continue with ChatGPT</a><p className="text-sm text-muted-foreground">İzni OpenAI ekranında tamamla; ardından burada bağlantıyı yenile. Bağlantı ekranı 5 dakika açık kalır.</p></div>}
          <p className="text-sm text-muted-foreground">Claude’u kendi Console API anahtarınla bağla. Claude sohbet aboneliği bu uygulamanın API ücretlerini kapsamaz.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border bg-background p-2"><Image src="/brand/openrouter.svg" alt="" width={28} height={28} className="size-full" /></div>
          <div className="flex-1"><CardTitle>OpenRouter</CardTitle><CardDescription>Modelleri kendi OpenRouter hesabınla kullan. Aynı bağlantı Jev değerlendirmelerinde de kullanılabilir.</CardDescription></div>
          <Badge variant={ai.openrouterConfigured ? "default" : "secondary"}>{ai.openrouterConfigured ? "Bağlı" : "Bağlı değil"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void openrouterConnection("POST")} disabled={pending !== "" || ai.openrouterConfigured}>{pending === "openrouter" ? <Spinner data-icon="inline-start" /> : null}OpenRouter hesabını bağla</Button>
          {ai.openrouterConfigured && <Button variant="outline" onClick={() => void openrouterConnection("DELETE")} disabled={pending !== ""}>Bağlantıyı kaldır</Button>}
          <p className="w-full text-sm text-muted-foreground">Onaydan sonra anahtar güvenli kasada tutulur. İstekler OpenRouter’a gönderilir ve hesabın üzerinden ücretlendirilebilir.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <BrainCircuit aria-hidden="true" />
            <div>
              <CardTitle>AI sağlayıcısı ve model</CardTitle>
          <CardDescription>Hesabını bağla, kullanacağın modeli seç ve bağlantıyı doğrula.</CardDescription>
            </div>
          </div>
          <Badge variant={!ai.enabled ? "secondary" : aiReady ? "default" : "destructive"}>{!ai.enabled ? "Kapalı" : aiReady ? "Hazır" : aiProvider === "codex" ? "Giriş gerekli" : "Bağlantı gerekli"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Sağlayıcı seç</FieldLabel>
              <div role="group" aria-label="AI sağlayıcısı" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {providerCards.map((provider) => <button key={provider.id} type="button" aria-pressed={aiProvider === provider.id} disabled={provider.disabled} onClick={() => chooseProvider(provider.id)} className={`flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${aiProvider === provider.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-accent/40"}`}>
                  {provider.brand ? <Image src={provider.brand} alt="" width={28} height={28} className="size-7 shrink-0" /> : <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md border text-xs font-semibold">{provider.id === "compatible" ? "API" : "C"}</span>}
                  <span className="min-w-0 flex-1"><span className="block font-medium">{provider.name}</span><span className="block truncate text-xs text-muted-foreground">{provider.detail}</span></span>
                  <span className={`size-2 shrink-0 rounded-full ${provider.ready ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-label={provider.ready ? "Bağlı" : "Bağlı değil"} />
                </button>)}
              </div>
              <FieldDescription>Seçili: {providerName}{aiProvider === "compatible" ? " · Chat Completions ve JSON Schema destekli HTTPS endpoint gerekir." : aiProvider === "openrouter" ? " · OpenRouter’daki bağlantın ve kullanım ücretlerin geçerlidir." : aiProvider === "chatgpt" ? " · Hesabında kullanılabilen modeller bağlantı yenilendiğinde listelenir." : aiProvider === "anthropic" ? " · Claude Console API kullanır; sohbet aboneliği API kullanımını kapsamaz." : aiProvider === "codex" ? " · Yalnız bu sunucuda izin verilen yerel oturum kullanılır." : " · Kişisel API anahtarın güvenli kasadan okunur."}</FieldDescription>
            </Field>
            {aiProvider === "compatible" && <>
              <Field>
                <FieldLabel htmlFor="compatible-name">Sağlayıcı adı</FieldLabel>
                <Input id="compatible-name" value={compatibleName} onChange={(event) => setCompatibleName(event.target.value)} maxLength={80} placeholder="OpenRouter, Groq, yerel gateway…" />
              </Field>
              <Field>
                <FieldLabel htmlFor="compatible-base-url">API temel URL</FieldLabel>
                <Input id="compatible-base-url" value={compatibleBaseUrl} onChange={(event) => setCompatibleBaseUrl(event.target.value)} inputMode="url" placeholder="https://api.example.com/v1" />
                <FieldDescription>HTTPS olmalı; uygulama otomatik olarak `/chat/completions` ekler.</FieldDescription>
              </Field>
            </>}
            <Field>
              <FieldLabel>{aiProvider === "compatible" ? "Model kimliği" : "Model seç"}</FieldLabel>
              {aiProvider === "compatible" ? <Input id="ai-model" value={aiModel} onChange={(event) => setAiModel(event.target.value)} maxLength={160} placeholder="Sağlayıcının model adı" /> : <div role="radiogroup" aria-label={`${providerName} modeli`} className="grid gap-2 sm:grid-cols-2">
                {aiModels.map((model) => <button key={model} type="button" aria-pressed={aiModel === model} onClick={() => setAiModel(model)} className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${aiModel === model ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}><span className="min-w-0 truncate text-sm font-medium">{model}</span><span aria-hidden="true" className={`size-4 shrink-0 rounded-full border ${aiModel === model ? "border-[5px] border-primary" : "border-muted-foreground/40"}`} /></button>)}
              </div>}
              <FieldDescription>Modelleri kendi içeriğinle bağlantı testi yaparak doğrula. İkinci görüş veya maliyet sağlayıcıya ve seçili modele göre değişir.</FieldDescription>
            </Field>
          </FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ai-enabled">AI kullanımına izin ver</FieldLabel>
              <FieldDescription>Kapalıyken yeni skor, draft ve discovery-query çağrıları yapılmaz. Manuel metin kaydı çalışmaya devam eder.</FieldDescription>
            </FieldContent>
            <Switch id="ai-enabled" checked={ai.enabled} onCheckedChange={(value) => void setAiEnabled(value)} disabled={pending !== ""} />
          </Field>
          <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Harcamalar ve sınırlar</summary>
          <section className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="AI kullanım eşikleri">
            <Field>
              <FieldLabel htmlFor="ai-daily-budget">Günlük tahmini kullanım eşiği (USD)</FieldLabel>
              <Input id="ai-daily-budget" type="number" min="0" max="1000000" step="any" value={dailyBudgetUsd} onChange={(event) => setDailyBudgetUsd(event.target.value)} />
              <FieldDescription>0 değeri sınırsız demektir. Günlük dönem UTC gece yarısında yenilenir; bu eşik gerçek fatura sınırı değildir.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-monthly-budget">Aylık tahmini kullanım eşiği (USD)</FieldLabel>
              <Input id="ai-monthly-budget" type="number" min="0" max="1000000" step="any" value={monthlyBudgetUsd} onChange={(event) => setMonthlyBudgetUsd(event.target.value)} />
              <FieldDescription>0 değeri sınırsız demektir. Aylık dönem UTC ay başında yenilenir; bu eşik gerçek fatura sınırı değildir.</FieldDescription>
            </Field>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Rezerve edilen tahmini kullanım: günlük ${ai.budget.dailyCommittedUsd.toFixed(4)} / {ai.budget.dailyBudgetUsd ? `$${ai.budget.dailyBudgetUsd.toFixed(2)}` : "sınırsız"}; aylık ${ai.budget.monthlyCommittedUsd.toFixed(4)} / {ai.budget.monthlyBudgetUsd ? `$${ai.budget.monthlyBudgetUsd.toFixed(2)}` : "sınırsız"}. Açık veya belirsiz istek: {ai.budget.pendingReservations}. API/Codex rezervasyonları sabit çağrı tahminidir, gerçek sağlayıcı faturası değildir. Anahtar uyumlu özel sağlayıcının maliyeti sağlayıcı bildirmedikçe bilinmiyor; eşik etkinse bu tür istekler güvenli biçimde durdurulur.
            </p>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Bu ay: sağlayıcı raporu ${ai.usage.reportedUsd.toFixed(4)}, uygulama tahmini ${ai.usage.estimatedUsd.toFixed(4)}, maliyeti bilinmeyen {ai.usage.unknownCostEvents} çağrı; {ai.usage.inputTokens} giriş ve {ai.usage.outputTokens} çıkış tokenı. Tahmin gerçek fatura değildir.
            </p>
          </section>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveAi} disabled={!aiModel || pending !== "" || (aiProvider === "codex" && !ai.codexAllowed)}>
              {pending === "ai" ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} AI ayarını kaydet
            </Button>
            <Button variant="outline" onClick={() => void testConnection()} disabled={!canTestConnection}>
              {pending === "connection-test" ? <Spinner data-icon="inline-start" /> : <BrainCircuit data-icon="inline-start" aria-hidden="true" />} Bağlantıyı test et
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Test, kaydedilmiş sağlayıcı ve anahtarla tek bir küçük yapılandırılmış yanıt isteği gönderir; sağlayıcı ücret yansıtabilir.</p>
          {!selectedSettingsAreSaved && <p className="text-sm text-muted-foreground">Bağlantıyı test etmeden önce seçili sağlayıcı, model ve endpoint ayarlarını kaydet.</p>}
          {connectionMessage && <Alert variant={connectionMessage.startsWith("Bağlantı doğrulandı:") ? "default" : "destructive"}><AlertDescription>{connectionMessage}</AlertDescription></Alert>}
          {ai.enabled && !aiReady && <Alert variant="destructive"><AlertDescription>{aiProvider === "codex" ? (ai.codexAllowed ? "Codex yerel oturumu hazır değil. Oturum açıp yeniden dene." : "Paylaşılan Codex oturumu üretim kullanıcı hesaplarında kullanılamaz. Kendi API anahtarını bağla.") : aiProvider === "compatible" ? compatibleCredentialsReady ? "Özel sağlayıcı modeli kullanmadan önce bağlantı testini başarıyla tamamla." : "HTTPS endpoint, model ve OpenAI-uyumlu AI API anahtarı gerekli." : aiProvider === "chatgpt" ? "Önce kendi ChatGPT hesabını yukarıdan bağla." : aiProvider === "anthropic" ? "Claude anahtarını gelişmiş bağlantılar bölümünden kaydet." : aiProvider === "openrouter" ? "Önce OpenRouter hesabını yukarıdan bağla." : "OpenAI API anahtarını gelişmiş bağlantılar bölümünden kaydet."}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model seçmeden önce karşılaştır</CardTitle>
          <CardDescription>Arena’nın metin tarzı kontrollü sıralamasına bak; ardından kendi içeriklerinle bağlantı ve kalite testi yap. Sıralama, Ispatla’da başarı garantisi değildir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {arena.available ? <>
            <p className="text-sm text-muted-foreground">Sunucu, Hugging Face Arena’nın doğrulanmış gerçek sıralamasını düzenli olarak yeniler{arena.updatedAt ? ` · ${arena.updatedAt}` : ""}. Arena adları sağlayıcı model kimlikleriyle her zaman eşleşmez; bu sıralama karşılaştırma içindir.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {arena.models.map((model) => <article key={`${model.rank}-${model.name}`} className="flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted font-semibold tabular-nums">{model.rank}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{model.name}</span><span className="block text-sm text-muted-foreground">{model.organization} · {model.votes.toLocaleString("tr-TR")} oy</span></span>
                <span className="text-right"><span className="block font-semibold tabular-nums">{model.rating.toFixed(1)}</span><span className="text-xs text-muted-foreground">Arena</span></span>
              </article>)}
            </div>
          </> : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Arena sıralaması şu anda alınamıyor. Biraz sonra yeniden dene.</p>}
          <a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Arena veri kümesini incele</a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border font-semibold tracking-tight">Jev</div>
          <div className="flex-1"><CardTitle>Jev değerlendirmesi</CardTitle><CardDescription>OpenRouter bağlantınla kaynak eşleşmelerine ek puan ver. Yeni ayrı anahtar gerekmez.</CardDescription></div>
          <Badge variant={jev.configured ? "default" : "secondary"}>{jev.mode === "off" ? "Kapalı" : jev.configured ? (jev.mode === "shadow" ? "Gölge" : "Etkin") : "Bağlantı bekliyor"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Jev çalışma modu" className="flex flex-wrap gap-2">
            {([ ["off", "Kapalı"], ["shadow", "Gölge"], ["on", "Etkin"] ] as const).map(([mode, label]) => <Button key={mode} type="button" variant={jev.mode === mode ? "default" : "outline"} aria-pressed={jev.mode === mode} onClick={() => void saveJev(mode)} disabled={jevPending || (mode !== "off" && !ai.openrouterConfigured)}>{label}</Button>)}
          </div>
          {jevPending && <Spinner aria-label="Jev ayarı kaydediliyor" />}
          <p className="w-full text-sm text-muted-foreground">Gölge modu sonuçları yalnızca değerlendirme için kaydeder. Etkin mod açıldığında ek maliyet oluşabilir; Jev yayın veya hesap güvenliği kararını tek başına vermez.</p>
        </CardContent>
      </Card>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Gelişmiş API anahtarları</summary>
        <p className="my-3 text-sm text-muted-foreground">OpenAI, Claude veya uyumlu sağlayıcıdan aldığın API anahtarını kaydet. Anahtar yalnızca girerken görünür.</p>
        <div className="space-y-4">
      {keys.map((key) => (
        <Card key={key.name}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {key.provider === "OpenAI" ? <Image src="/brand/openai.svg" alt="OpenAI" width={24} height={24} /> : key.provider === "Claude" ? <Image src="/brand/anthropic.svg" alt="Anthropic" width={24} height={24} /> : <KeyRound aria-hidden="true" />}
              <div>
                <CardTitle>{key.provider}</CardTitle>
                <CardDescription>{key.configured ? "Anahtar kaydedildi" : "Henüz bağlanmadı"}</CardDescription>
              </div>
            </div>
            <Badge variant={key.configured ? "secondary" : "outline"}>{key.configured ? "Bağlı" : "Bağlı değil"}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={key.name}>Yeni değer</FieldLabel>
              <FieldDescription>Değer yalnızca sunucu tarafı kasaya yazılır ve arayüzde tekrar gösterilmez.</FieldDescription>
              <Input id={key.name} type="password" autoComplete="new-password" value={values[key.name] || ""} onChange={(event) => setValues((current) => ({ ...current, [key.name]: event.target.value }))} placeholder="••••••••" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(key)} disabled={!values[key.name] || pending !== ""}>
                {pending === key.name ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} Güncelle
              </Button>
              {key.configured && (
                <Button variant="destructive" onClick={() => remove(key)} disabled={pending !== ""}>
                  {pending === key.name ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />} Kaldır
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
