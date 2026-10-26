"use client";

import { useState } from "react";
import { DEFAULT_LOCALE, localeFromPath, localizePath } from "@/i18n/config";
import { usePathname, useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

export type XConsentAction = "post" | "repost" | "reply" | "future_quote";
export type XConsentMode = "observe" | "assist" | "auto" | "off";
export type XConsentState = { action: XConsentAction; mode: XConsentMode; policyVersion: string; copyVersion: string; dailyLimit: number; cadenceSeconds: number; version: number; grantedAt: number | null; revokedAt: number | null };
export type XConnectionState = { connected: boolean; handle: string; authState: string; connectedAt: number; lastHealthAt: number; lastAuthError: string; expiresAt: number | null; scopes: string[]; refreshedAt: number | null; tokenVersion: number | null; consents: XConsentState[] } | null;

export function XConnectButton({ returnTo, size = "default" }: { returnTo?: string; size?: "default" | "sm" }) {
  const locale = localeFromPath(usePathname()) ?? DEFAULT_LOCALE;
  const t = (tr: string, en: string) => locale === "tr" ? tr : en;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
      const body = await response.json();
      if (!response.ok) throw new Error((locale === "tr" && body.error) || t("Hesap eklenemedi.", "Could not add the account."));
      setOpen(false);
      const target = new URL(returnTo ?? localizePath(locale, "/accounts"), window.location.origin);
      if (target.origin !== window.location.origin) throw new Error(t("Geçersiz dönüş adresi.", "Invalid return address."));
      target.searchParams.set("accountId", String(body.account.id));
      router.push(target.pathname + target.search);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("Hesap eklenemedi.", "Could not add the account.")); }
    finally { setPending(false); }
  }
  return <><Button type="button" size={size} onClick={() => setOpen(true)}>{t("𝕏 hesabı ekle", "Add a 𝕏 account")}</Button><Sheet open={open} onOpenChange={setOpen}><SheetContent><SheetHeader><SheetTitle>{t("𝕏 hesabı ekle", "Add a 𝕏 account")}</SheetTitle><SheetDescription>{t("Herkese açık gönderilerden kategori ve yazı tarzı hazırlanır. Hesap sahipliği ayrıca doğrulanır.", "Categories and writing style are prepared from public posts. Account ownership is verified separately.")}</SheetDescription></SheetHeader><form className="flex flex-col gap-5 px-4" onSubmit={(event) => { event.preventDefault(); void add(); }}><Field><FieldLabel htmlFor="public-x-handle">{t("Kullanıcı adı", "Username")}</FieldLabel><Input id="public-x-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@elonmusk" required maxLength={16} autoComplete="off" /><FieldDescription>{t("𝕏 şifresi gerekmez.", "No 𝕏 password needed.")}</FieldDescription></Field>{error && <Alert><AlertDescription>{error}</AlertDescription></Alert>}<Button type="submit" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("Hesabı analiz et", "Analyze account")}</Button></form></SheetContent></Sheet></>;
}

export function XConnectionControls({ accountId }: { accountId: number; initial: XConnectionState; policyVersion: string; copyVersion: string }) {
  const locale = localeFromPath(usePathname()) ?? DEFAULT_LOCALE;
  const t = (tr: string, en: string) => locale === "tr" ? tr : en;
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function action(path: string) {
    setPending(true); setNotice("");
    try {
      const response = await fetch(`/api/accounts/${accountId}/${path}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error((locale === "tr" && body.error) || t("İşlem tamamlanamadı.", "The action could not be completed."));
      if (body.token) setToken(body.token);
      setNotice(body.verified ? t("Hesap sahipliği doğrulandı. Biyografideki kodu kaldırabilirsiniz.", "Account ownership verified. You can remove the code from your bio.") : body.token ? t("Kodu 𝕏 biyografinize ekleyin ve doğrulayın. Kod 30 dakika geçerlidir.", "Add the code to your 𝕏 bio and verify it. The code expires in 30 minutes.") : t("Hesap analizi yenilendi.", "Account analysis updated."));
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : t("İşlem tamamlanamadı.", "The action could not be completed.")); }
    finally { setPending(false); }
  }
  return <Card><CardHeader><CardTitle>{t("Hesap analizi ve sahiplik", "Account analysis and ownership")}</CardTitle><CardDescription>{t("Kategoriler ve yazı tarzı herkese açık verilerden çıkarılır. Manuel tercihleriniz korunur.", "Categories and writing style are inferred from public data. Your manual preferences are preserved.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Badge variant="outline">{t("Otomatik yayın kapalı", "Automatic publishing is off")}</Badge><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => void action("reanalyze")}>{t("Yeniden analiz et", "Analyze again")}</Button><Button variant="outline" disabled={pending} onClick={() => void action("claims/start")}>{t("Sahiplik kodu oluştur", "Create ownership code")}</Button>{token && <Button disabled={pending} onClick={() => void action("claims/verify")}>{t("Biyografiden doğrula", "Verify bio")}</Button>}</div>{token && <code className="break-all rounded-md bg-muted p-3 text-sm">{token}</code>}{notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}</CardContent></Card>;
}
