"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Link2, Unlink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type XConsentAction = "post" | "repost" | "reply" | "future_quote";
export type XConsentMode = "observe" | "assist" | "auto" | "off";
export type XConsentState = {
  action: XConsentAction;
  mode: XConsentMode;
  policyVersion: string;
  copyVersion: string;
  dailyLimit: number;
  cadenceSeconds: number;
  version: number;
  grantedAt: number | null;
  revokedAt: number | null;
};
export type XConnectionState = {
  connected: boolean;
  handle: string;
  authState: string;
  connectedAt: number;
  lastHealthAt: number;
  lastAuthError: string;
  expiresAt: number | null;
  scopes: string[];
  refreshedAt: number | null;
  tokenVersion: number | null;
  consents: XConsentState[];
} | null;

export function XConnectButton({ returnTo = "/accounts?connection=connected", size = "default" }: { returnTo?: string; size?: "default" | "sm" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/x/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnTo }),
      });
      const body = await responseBody(response);
      if (!response.ok || typeof body.authorizationUrl !== "string") throw new Error(typeof body.error === "string" ? body.error : "𝕏 bağlantısı başlatılamadı.");
      window.location.assign(body.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "𝕏 bağlantısı başlatılamadı.");
      setPending(false);
    }
  }
  return <span className="inline-flex flex-col items-start gap-1">
    <Button type="button" size={size} onClick={connect} disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" aria-hidden="true" />} 𝕏 hesabını bağla
    </Button>
    {error ? <span role="alert" className="max-w-56 text-xs text-destructive">{error}</span> : null}
  </span>;
}

type ConsentDraft = { mode: Exclude<XConsentMode, "auto">; dailyLimit: number; cadenceSeconds: number };
const ACTIONS: Array<{ id: XConsentAction; label: string; description: string }> = [
  { id: "post", label: "Yeni gönderi", description: "İSPATLA hesabınız adına özgün bir gönderi hazırlar veya yayın akışına alır." },
  { id: "repost", label: "Yeniden paylaşım", description: "Seçtiğiniz bir gönderiyi bu 𝕏 hesabından yeniden paylaşır." },
  { id: "reply", label: "Yanıt", description: "Yalnızca hesabınızı etiketleyen veya gönderinizi alıntılayan kişilere yanıt verir." },
  { id: "future_quote", label: "Alıntı gönderisi", description: "Bir gönderi hakkında kendi metninizle alıntı gönderisi hazırlar." },
];
const REQUIRED_SCOPE_LABELS = ["Gönderileri oku", "Gönderi yayınla", "Hesap kimliğini oku", "Medya yükle", "Bağlantıyı sürdür"];

function localDate(timestamp: number | null): string {
  return timestamp ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp * 1000)) : "—";
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export function XConnectionControls({ accountId, initial, policyVersion, copyVersion }: {
  accountId: number;
  initial: XConnectionState;
  policyVersion: string;
  copyVersion: string;
}) {
  const [connection, setConnection] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, ConsentDraft>>(() => Object.fromEntries((initial?.consents || []).map((consent) => [consent.action, {
    mode: consent.mode === "auto" ? "observe" : consent.mode,
    dailyLimit: consent.dailyLimit || 3,
    cadenceSeconds: consent.cadenceSeconds || 3600,
  }])));
  const [busy, setBusy] = useState(false);
  const [savingAction, setSavingAction] = useState<XConsentAction | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const connected = connection?.connected === true;
  const reauthorizationNeeded = connection?.authState === "reauthorization_required";

  async function refreshConnection(): Promise<XConnectionState> {
    const response = await fetch(`/api/accounts/${accountId}/connection`, { cache: "no-store" });
    const body = await responseBody(response);
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Bağlantı durumu alınamadı.");
    const next = body as unknown as XConnectionState;
    setConnection(next);
    if (next) setDrafts(Object.fromEntries(next.consents.map((consent) => [consent.action, {
      mode: consent.mode === "auto" ? "observe" : consent.mode,
      dailyLimit: consent.dailyLimit || 3,
      cadenceSeconds: consent.cadenceSeconds || 3600,
    }])));
    return next;
  }

  async function connect() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/x/oauth/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnTo: `/accounts?connection=connected&accountId=${accountId}` }),
      });
      const body = await responseBody(response);
      if (!response.ok || typeof body.authorizationUrl !== "string") throw new Error(typeof body.error === "string" ? body.error : "𝕏 bağlantısı başlatılamadı.");
      window.location.assign(body.authorizationUrl);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "𝕏 bağlantısı başlatılamadı.", error: true });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("𝕏 bağlantısını kesmek istiyor musunuz? Açık otomasyon izinleri bu hesap için de kapatılır.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/accounts/${accountId}/connection`, { method: "DELETE" });
      const body = await responseBody(response);
      if (!response.ok || body.disconnected !== true) throw new Error(typeof body.error === "string" ? body.error : "𝕏 bağlantısı kesilemedi.");
      const providerRevoked = body.providerRevoked === true;
      await refreshConnection();
      setNotice({ text: providerRevoked
        ? "İSPATLA bağlantısı kapatıldı ve 𝕏 erişimi iptal edildi."
        : "İSPATLA bağlantısı kapatıldı. 𝕏 erişimi iptal edilemedi; 𝕏 ayarlarından İSPATLA erişimini kaldırın.", error: !providerRevoked });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "𝕏 bağlantısı kesilemedi.", error: true });
    } finally { setBusy(false); }
  }

  async function saveConsent(action: XConsentAction) {
    const consent = connection?.consents.find((item) => item.action === action);
    const draft = drafts[action];
    if (!consent || !draft) return;
    setSavingAction(action);
    setNotice(null);
    try {
      const response = await fetch(`/api/accounts/${accountId}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, mode: draft.mode, policyVersion, copyVersion,
          dailyLimit: draft.dailyLimit, cadenceSeconds: draft.cadenceSeconds, expectedVersion: consent.version }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        if (response.status === 409) {
          await refreshConnection();
          throw new Error("İzin sürümü değişti. Güncel durumu yeniden inceleyin.");
        }
        throw new Error(typeof body.error === "string" ? body.error : "İzin kaydedilemedi.");
      }
      const next = await refreshConnection();
      const saved = next?.consents.find((item) => item.action === action);
      setNotice({ text: saved?.mode === "off" ? `${ACTIONS.find((item) => item.id === action)?.label} izni kapatıldı.` : "İzin tercihi kaydedildi.", error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "İzin kaydedilemedi.", error: true });
    } finally { setSavingAction(null); }
  }

  const connectionMessage = !connection
    ? "Bu hesap için henüz 𝕏 bağlantısı yok."
    : reauthorizationNeeded
      ? "𝕏 erişim izni yenilenmeli. Yeniden bağlanınca hesap ayarlarınız korunur."
      : connection.connected ? "𝕏 hesabınız güvenli biçimde bağlı." : "Bu hesabın 𝕏 bağlantısı kapalı.";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2"><Link2 aria-hidden="true" className="size-4 text-primary" /> 𝕏 bağlantısı</CardTitle>
            <CardDescription>{connectionMessage}</CardDescription>
          </div>
          {connected ? (
            <Button type="button" variant="outline" onClick={disconnect} disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : <Unlink data-icon="inline-start" aria-hidden="true" />} Bağlantıyı kes
            </Button>
          ) : (
            <Button type="button" onClick={connect} disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" aria-hidden="true" />} {reauthorizationNeeded ? "𝕏 erişimini yenile" : "𝕏 hesabını bağla"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {connection?.handle ? <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">@{connection.handle}</Badge><span className="text-sm text-muted-foreground">Bağlandı: {localDate(connection.connectedAt)}</span></div> : null}
          {reauthorizationNeeded ? <Alert><AlertCircle aria-hidden="true" /><AlertDescription>Oturumunuz açık. 𝕏 hesabını yeniden bağlayarak erişimi yenileyin.</AlertDescription></Alert> : null}
          {connection ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verilen izinler</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{connection.scopes.map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}</div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Son doğrulama</dt><dd>{localDate(connection.lastHealthAt)}</dd>
                <dt className="text-muted-foreground">Son yenileme</dt><dd>{localDate(connection.refreshedAt)}</dd>
                <dt className="text-muted-foreground">Erişim süresi</dt><dd>{localDate(connection.expiresAt)}</dd>
              </dl>
            </div>
          ) : <p className="text-sm text-muted-foreground">𝕏 izinleri yalnız bu sunucuda saklanır. Tarayıcıya erişim anahtarı gönderilmez.</p>}
        </CardContent>
      </Card>

      {connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Otomasyon izinleri</CardTitle>
            <CardDescription>𝕏 hesabını bağlamak otomatik işlem izni vermez. Her eylemi ayrı ayrı seçebilir ve istediğiniz zaman kapatabilirsiniz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Alert><CheckCircle2 aria-hidden="true" /><AlertDescription>Otomatik yayın henüz kullanıma açık değil. Otomatik seçeneği etkinleştiğinde bu ekranda ayrıca, eylem başına izin istenecek.</AlertDescription></Alert>
            <FieldGroup>
              {ACTIONS.map((action) => {
                const consent = connection.consents.find((item) => item.action === action.id);
                const draft = drafts[action.id] || { mode: "observe" as const, dailyLimit: 3, cadenceSeconds: 3600 };
                return (
                  <section key={action.id} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-xl space-y-1">
                        <h3 className="font-medium">{action.label}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                      <Badge variant={consent?.mode === "off" ? "outline" : "secondary"}>{consent?.mode === "off" ? "kapalı" : consent?.mode === "assist" ? "onaylı" : "gözlem"}</Badge>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:items-end">
                      <Field>
                        <FieldLabel htmlFor={`consent-${accountId}-${action.id}`}>Tercih</FieldLabel>
                        <FieldDescription id={`consent-description-${action.id}`}>Otomatik yayın şimdilik devre dışı.</FieldDescription>
                        <select id={`consent-${accountId}-${action.id}`} aria-describedby={`consent-description-${action.id}`}
                          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          value={draft.mode} onChange={(event) => setDrafts((current) => ({ ...current, [action.id]: { ...draft, mode: event.target.value as ConsentDraft["mode"] } }))}>
                          <option value="observe">Gözlemle</option>
                          <option value="assist">İnsan onayı iste</option>
                          <option value="auto" disabled>Otomatik yayın — henüz kullanıma açık değil</option>
                          <option value="off">İzin verme</option>
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`daily-${accountId}-${action.id}`}>Günlük sınır</FieldLabel>
                        <Input id={`daily-${accountId}-${action.id}`} type="number" min={0} max={100} value={draft.dailyLimit}
                          onChange={(event) => setDrafts((current) => ({ ...current, [action.id]: { ...draft, dailyLimit: Number(event.target.value) } }))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`cadence-${accountId}-${action.id}`}>Aralık (sn)</FieldLabel>
                        <Input id={`cadence-${accountId}-${action.id}`} type="number" min={0} max={86400} value={draft.cadenceSeconds}
                          onChange={(event) => setDrafts((current) => ({ ...current, [action.id]: { ...draft, cadenceSeconds: Number(event.target.value) } }))} />
                      </Field>
                      <Button type="button" variant="outline" onClick={() => saveConsent(action.id)} disabled={savingAction !== null || !consent}>
                        {savingAction === action.id ? <Spinner data-icon="inline-start" /> : null} Kaydet
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">İzin metni {consent?.copyVersion || copyVersion} · kural sürümü {consent?.policyVersion || policyVersion} · durum sürümü {consent?.version ?? 1}</p>
                  </section>
                );
              })}
            </FieldGroup>
            <p className="text-xs text-muted-foreground">İstenen izin kapsamları: {REQUIRED_SCOPE_LABELS.join(" · ")}. Her tercih bu hesabın ve eylemin kapsamındadır.</p>
          </CardContent>
        </Card>
      ) : null}

      {notice ? <Alert role="status" aria-live="polite" data-variant={notice.error ? "destructive" : "default"}>
        {notice.error ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<AlertDescription>{notice.text}</AlertDescription>
      </Alert> : null}
      {connected ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><ExternalLink aria-hidden="true" className="size-3" /> İzinleri sonradan 𝕏 hesap ayarlarından da iptal edebilirsiniz.</p> : null}
    </div>
  );
}
