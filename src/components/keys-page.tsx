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
    setPending("ai");
    const response = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: aiProvider, model: aiModel, compatibleBaseUrl, compatibleName }),
    });
    const body = await response.json().catch(() => ({}));
    setPending("");
    setMessage(response.ok ? `${aiProvider === "codex" ? "Codex" : aiProvider === "compatible" ? "Özel sağlayıcı" : "OpenAI API"} çalıştırıcısı kaydedildi.` : body.error || "AI ayarı kaydedilemedi.");
    if (response.ok) await loadAi();
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
  const aiReady = aiProvider === "codex" ? ai.codex.authenticated : aiProvider === "compatible" ? Boolean(ai.compatibleConfigured && compatibleBaseUrl && aiModel) : ai.apiConfigured;

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
              <CardDescription>OpenAI, OpenAI-uyumlu endpointler veya yerel Codex hesabını seç. Her çalıştırıcıda kendi model kimliğini girebilir ya da önerilen modeli seçebilirsin.</CardDescription>
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
                  <SelectItem value="codex">Codex · yerel CLI</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{aiProvider === "codex" ? `${ai.codex.bin}${ai.codex.version ? ` · ${ai.codex.version}` : ""}` : aiProvider === "compatible" ? "Chat Completions + JSON Schema destekleyen HTTPS endpoint kullanılır." : "OPENAI_API_KEY kasadan okunur; cevaplar store=false ile istenir."}</FieldDescription>
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveAi} disabled={!aiModel || pending !== ""}>
              {pending === "ai" ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} AI ayarını kaydet
            </Button>
          </div>
          {ai.enabled && !aiReady && <Alert variant="destructive"><AlertDescription>{aiProvider === "codex" ? (ai.codex.reason || "Codex login status doğrulanamadı.") : aiProvider === "compatible" ? "HTTPS endpoint, model ve OpenAI-uyumlu AI API anahtarı gerekli." : "OpenAI key edit alanından bir API anahtarı kaydet."}</AlertDescription></Alert>}
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
