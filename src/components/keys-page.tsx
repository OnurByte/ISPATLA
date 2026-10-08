"use client";

import { useState } from "react";
import { BrainCircuit, KeyRound, LockKeyhole, Save, Trash2 } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

type KeyMeta = { name: string; provider: string; configured: boolean; masked: string; updatedAt: number };
type AiProvider = "api" | "compatible" | "codex";
type AiPanel = {
  enabled: boolean;
  settings: { provider: AiProvider; model: string };
  configured: boolean;
  apiConfigured: boolean;
  compatibleConfigured: boolean;
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
    const body = await response.json().catch(() => ({}));
    setPending("");
    setMessage(response.ok ? `${key.provider} key kasaya yazıldı.` : body.error || "Key kaydedilemedi.");
    if (response.ok) {
      setValues((current) => ({ ...current, [key.name]: "" }));
      await load();
      await loadAi();
    }
  }

  async function remove(key: KeyMeta) {
    setPending(key.name);
    await fetch(`/api/settings/keys/${key.name}`, { method: "DELETE" });
    setPending("");
    setMessage(`${key.provider} key kaldırıldı.`);
    await load();
    await loadAi();
  }

  async function saveAi() {
    setConnectionMessage("");
    setPending("ai");
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: aiProvider, model: aiModel, compatibleBaseUrl, compatibleName, dailyBudgetUsd: Number(dailyBudgetUsd), monthlyBudgetUsd: Number(monthlyBudgetUsd) }),
    });
    const body = await response.json().catch(() => ({}));
    setPending("");
    setMessage(response.ok ? `${aiProvider === "codex" ? "Codex" : aiProvider === "compatible" ? "Özel sağlayıcı" : "OpenAI API"} çalıştırıcısı kaydedildi.` : body.error || "AI ayarı kaydedilemedi.");
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
    const body = await response.json().catch(() => ({}));
    setPending("");
    setMessage(response.ok ? `AI kullanımı ${enabled ? "açıldı" : "kapatıldı"}.` : body.error || "AI durumu değişmedi.");
    if (response.ok) await loadAi();
  }

  const aiModels = ai.models[aiProvider] || [];
  const compatibleCredentialsReady = Boolean(ai.compatibleConfigured && compatibleBaseUrl && aiModel);
  const aiReady = aiProvider === "codex" ? ai.codexAllowed && ai.codex.authenticated : aiProvider === "compatible" ? Boolean(compatibleCredentialsReady && ai.compatibleCapabilityVerified) : ai.apiConfigured;
  const selectedSettingsAreSaved = ai.settings.provider === aiProvider
    && ai.settings.model === aiModel
    && (aiProvider !== "compatible" || (ai.compatible.baseUrl === compatibleBaseUrl && ai.compatible.name === compatibleName));
  const canTestConnection = selectedSettingsAreSaved && (aiProvider === "compatible" ? compatibleCredentialsReady : aiReady) && pending === "";

  return (
    <div className="flex flex-col gap-5">
      <Alert variant={vaultReady ? "default" : "destructive"}>
        <LockKeyhole aria-hidden="true" />
        <AlertDescription>
          {vaultReady ? "AES-256-GCM kasa hazır; raw değerler geri okunmaz." : "Kaydetmeden önce ISPATLA_SECRET_KEY environment secret’ını tanımla."}
        </AlertDescription>
        <AlertAction><Badge variant={vaultReady ? "default" : "destructive"}>{vaultReady ? "hazır" : "kurulmamış"}</Badge></AlertAction>
      </Alert>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <BrainCircuit aria-hidden="true" />
            <div>
              <CardTitle>AI çalıştırıcısı</CardTitle>
          <CardDescription>OpenAI, doğrulaması gereken OpenAI-uyumlu endpointler veya izinli operatör bağlamında yerel Codex çalıştırıcısını seç.</CardDescription>
            </div>
          </div>
          <Badge variant={!ai.enabled ? "secondary" : aiReady ? "default" : "destructive"}>{!ai.enabled ? "kapalı" : aiReady ? "hazır" : aiProvider === "codex" ? "login yok" : "key yok"}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ai-provider">Çalıştırıcı</FieldLabel>
              <Select value={aiProvider} onValueChange={(value) => {
                if (value !== "api" && value !== "compatible" && value !== "codex") return;
                setAiProvider(value);
                setAiModel(ai.models[value][0] || aiModel);
              }}>
                <SelectTrigger id="ai-provider" className="w-full" aria-label="AI çalıştırıcısı"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="api">OpenAI API · Responses</SelectItem>
                  <SelectItem value="compatible">OpenAI-uyumlu API · özel</SelectItem>
                  <SelectItem value="codex" disabled={!ai.codexAllowed}>Codex · {ai.codexAllowed ? "yerel CLI" : "kullanılamıyor"}</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{aiProvider === "codex" ? (ai.codexAllowed ? `${ai.codex.bin}${ai.codex.version ? ` · ${ai.codex.version}` : ""}` : "Üretim hesabında paylaşılan Codex CLI kullanılamaz.") : aiProvider === "compatible" ? "Chat Completions + JSON Schema destekleyen HTTPS endpoint kullanılır." : "OPENAI_API_KEY kasadan okunur; cevaplar store=false ile istenir."}</FieldDescription>
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
              <FieldLabel htmlFor="ai-model">Model</FieldLabel>
              <Input id="ai-model" list="ai-model-options" value={aiModel} onChange={(event) => setAiModel(event.target.value)} maxLength={160} placeholder="Sağlayıcının model kimliği" />
              <datalist id="ai-model-options">{aiModels.map((model) => <option key={model} value={model} />)}</datalist>
              <FieldDescription>Sağlayıcının tam model kimliğini kullan. Önerilen listedeki OpenAI/Codex modellerinde düşük güven veya sınır skorlarında Terra ikinci görüş olarak çağrılabilir; özel model kendi kimliğiyle yeniden değerlendirilir.</FieldDescription>
            </Field>
          </FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ai-enabled">AI kullanımına izin ver</FieldLabel>
              <FieldDescription>Kapalıyken yeni skor, draft ve discovery-query çağrıları yapılmaz. Manuel metin kaydı çalışmaya devam eder.</FieldDescription>
            </FieldContent>
            <Switch id="ai-enabled" checked={ai.enabled} onCheckedChange={(value) => void setAiEnabled(value)} disabled={pending !== ""} />
          </Field>
          <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2" aria-label="AI kullanım eşikleri">
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
          {ai.enabled && !aiReady && <Alert variant="destructive"><AlertDescription>{aiProvider === "codex" ? (ai.codexAllowed ? ai.codex.reason || "Codex login status doğrulanamadı." : "Paylaşılan Codex oturumu üretim kullanıcı hesaplarında kullanılamaz. Kendi API anahtarını bağla.") : aiProvider === "compatible" ? compatibleCredentialsReady ? "Özel sağlayıcı modeli kullanmadan önce bağlantı testini başarıyla tamamla." : "HTTPS endpoint, model ve OpenAI-uyumlu AI API anahtarı gerekli." : "OpenAI key edit alanından bir API anahtarı kaydet."}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {keys.map((key) => (
        <Card key={key.name}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <KeyRound aria-hidden="true" />
              <div>
                <CardTitle>{key.provider}</CardTitle>
                <CardDescription>{key.name} · {key.configured ? key.masked : "ayarlı değil"}</CardDescription>
              </div>
            </div>
            <Badge variant={key.configured ? "secondary" : "outline"}>{key.configured ? "configured" : "missing"}</Badge>
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

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
