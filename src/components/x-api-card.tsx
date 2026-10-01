"use client";

// X API credential panel: Bearer token for read-only access, OAuth 2.0
// authorization for anything that acts as the account.
//
// The two modes are not alternatives the user picks between — they stack. A
// bearer token alone gives timeline and search; OAuth on top is what makes
// publishing possible. The panel therefore shows both and states plainly which
// capability each unlocks, because X answers a publish attempt made with only a
// bearer token with a 403 that reads like a quota limit.

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type XApiStatus = {
  mode: "bearer" | "oauth" | null;
  configured: boolean;
  canPublish: boolean;
  canRead: boolean;
  accessTokenExpired: boolean;
  missing: string[];
};

type VerifyResult = { ok: boolean; mode: string | null; identity: string; detail: string };

export function XApiCard({ initialStatus }: { initialStatus: XApiStatus }) {
  const [status, setStatus] = useState<XApiStatus>(initialStatus);
  const [bearer, setBearer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  async function save(field: "bearer" | "clientId" | "clientSecret", value: string) {
    setBusy(field);
    try {
      const response = await fetch("/api/settings/x-api/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      const payload = await response.json();
      if (payload.status) setStatus(payload.status);
      if (field === "bearer") setBearer("");
      if (field === "clientId") setClientId("");
      if (field === "clientSecret") setClientSecret("");
    } finally {
      setBusy(null);
    }
  }

  async function clear(field: "bearer" | "clientId" | "clientSecret") {
    setBusy(field);
    try {
      const response = await fetch("/api/settings/x-api/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, clear: true }),
      });
      const payload = await response.json();
      if (payload.status) setStatus(payload.status);
      setVerify(null);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("oauth");
    try {
      const response = await fetch("/api/settings/x-api/credentials", { method: "DELETE" });
      const payload = await response.json();
      if (payload.status) setStatus(payload.status);
      setVerify(null);
    } finally {
      setBusy(null);
    }
  }

  async function startOAuth() {
    setBusy("oauth");
    setVerify(null);
    try {
      const response = await fetch("/api/settings/x-api/authorize", { method: "POST" });
      const payload = await response.json();
      if (payload.authorizeUrl) {
        window.open(payload.authorizeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      setVerify({ ok: false, mode: null, identity: "", detail: payload.error || "başlatılamadı" });
    } finally {
      setBusy(null);
    }
  }

  async function runVerify() {
    setBusy("verify");
    try {
      const response = await fetch("/api/settings/x-api/status", { method: "POST" });
      const payload = await response.json();
      setVerify(payload);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              X API v2
            </CardTitle>
            <CardDescription>
              Resmî API. Bearer token okuma yapar; yayınlamak için OAuth 2.0 gerekir.
            </CardDescription>
          </div>
          <Badge variant={status.canPublish ? "default" : status.canRead ? "secondary" : "outline"}>
            {status.mode === "oauth" ? "OAuth 2.0" : status.mode === "bearer" ? "Bearer" : "kurulmadı"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <AlertTitle>Ne yapabiliyor</AlertTitle>
          <AlertDescription>
            <span className={status.canRead ? "text-foreground" : "text-muted-foreground"}>
              Okuma (timeline, arama): {status.canRead ? "var" : "yok"}
            </span>
            {" · "}
            <span className={status.canPublish ? "text-foreground" : "text-muted-foreground"}>
              Yayınlama: {status.canPublish ? "var" : "yok"}
            </span>
            {status.accessTokenExpired ? " — access token süresi doldu, yenilemeyi deneyin." : ""}
            {status.missing.length ? ` Eksik: ${status.missing.join(", ")}.` : ""}
          </AlertDescription>
        </Alert>

        {verify ? (
          <Alert variant={verify.ok ? "default" : "destructive"}>
            <AlertTitle className="flex items-center gap-2">
              {verify.ok ? <BadgeCheck className="size-4" aria-hidden /> : <Unplug className="size-4" aria-hidden />}
              {verify.ok ? `Bağlı${verify.identity ? ` — ${verify.identity}` : ""}` : "Bağlantı başarısız"}
            </AlertTitle>
            <AlertDescription>{verify.detail}</AlertDescription>
          </Alert>
        ) : null}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="x-bearer">Bearer token (app-only)</FieldLabel>
            <FieldDescription>
              X developer portal → Project → Keys → Bearer Token. Yalnızca okuma.
            </FieldDescription>
            <FieldContent className="flex gap-2">
              <Input
                id="x-bearer"
                type="password"
                autoComplete="off"
                placeholder="AAAAAAAA…"
                value={bearer}
                onChange={(event) => setBearer(event.target.value)}
              />
              <Button
                type="button"
                disabled={!bearer.trim() || busy !== null}
                onClick={() => save("bearer", bearer)}
              >
                {busy === "bearer" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Kaydet"}
              </Button>
              {status.mode && (
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => clear("bearer")}>
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">Bearer token sil</span>
                </Button>
              )}
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>OAuth 2.0 client (yayınlama)</FieldLabel>
            <FieldDescription>
              Client ID ve secret olmadan OAuth başlatılamaz. Token değişimi sunucu tarafında PKCE ile yapılır.
            </FieldDescription>
            <FieldContent className="space-y-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="x-client-id">Client ID</FieldLabel>
                <div className="flex gap-2">
                <Input
                  id="x-client-id"
                  type="password"
                  autoComplete="off"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                />
                <Button
                  type="button"
                  disabled={!clientId.trim() || busy !== null}
                  onClick={() => save("clientId", clientId)}
                >
                  {busy === "clientId" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Kaydet"}
                </Button>
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => clear("clientId")}>
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">Client ID sil</span>
                </Button>
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="x-client-secret">Client secret</FieldLabel>
                <div className="flex gap-2">
                <Input
                  id="x-client-secret"
                  type="password"
                  autoComplete="off"
                  placeholder="Client secret"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                />
                <Button
                  type="button"
                  disabled={!clientSecret.trim() || busy !== null}
                  onClick={() => save("clientSecret", clientSecret)}
                >
                  {busy === "clientSecret" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Kaydet"}
                </Button>
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => clear("clientSecret")}>
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">Client secret sil</span>
                </Button>
                </div>
              </div>
            </FieldContent>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={startOAuth}>
            <ExternalLink className="size-4" aria-hidden />
            X&apos;de yetkilendir
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={runVerify}>
            {busy === "verify" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BadgeCheck className="size-4" aria-hidden />}
            Bağlantıyı test et
          </Button>
          {status.mode === "oauth" && (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={disconnect}>
              <Unplug className="size-4" aria-hidden />
              OAuth bağını kes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
