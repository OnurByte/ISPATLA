"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUiText } from "@/i18n/ui-client";

export function AccountLifecycleControls() {
  const { t } = useUiText();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function disable() {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/account/disable", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t("Could not deactivate the account."));
      setMessage(t("Account deactivated. Sign in again to reactivate it."));
    } catch (error) { setMessage(error instanceof Error ? t(error.message) : t("Could not deactivate the account.")); }
    finally { setPending(false); }
  }

  async function deleteAccount() {
    if (confirmation.trim() !== t("DELETE")) return setMessage(t("Type DELETE in the confirmation field to continue."));
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/auth/delete-user", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || t("Could not delete the account. Sign in again and try once more."));
      setMessage(t("The account and linked data have been deleted. Redirecting to sign in."));
      window.setTimeout(() => { router.replace("/login"); router.refresh(); }, 900);
    } catch (error) { setMessage(error instanceof Error ? t(error.message) : t("Could not delete the account.")); }
    finally { setPending(false); }
  }

  return <Card>
    <CardHeader><CardTitle>{t("Account actions")}</CardTitle><CardDescription>{t("You can temporarily deactivate your account or delete it permanently.")}</CardDescription></CardHeader>
    <CardContent>
      <details className="group rounded-md border px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Open account actions")}</summary>
        <div className="mt-4 flex flex-col gap-5 border-t pt-4">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-sm font-medium">{t("Deactivate account")}</h3><p className="text-sm text-muted-foreground">{t("Your sessions will be closed. Sign in again with email or 𝕏 to reactivate your account.")}</p></div>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void disable()}>{t("Deactivate account")}</Button>
          </section>
          <section className="flex flex-col gap-3 border-t pt-4">
            <div><h3 className="text-sm font-medium">{t("Permanently delete account")}</h3><p className="text-sm text-muted-foreground">{t("Your account data and linked records will be deleted. This cannot be undone. If you use email, enter your password; if you sign in only with 𝕏, you must have signed in recently.")}</p></div>
            <label htmlFor="account-delete-password" className="text-sm font-medium">{t("Password")} <span className="font-normal text-muted-foreground">{t("(for email accounts; leave blank if you sign in with 𝕏)")}</span></label>
            <Input id="account-delete-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="account-delete-confirmation" className="text-sm font-medium">{t("Type DELETE to confirm")}</label>
            <Input id="account-delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            <div><Button type="button" variant="destructive" disabled={pending || confirmation.trim() !== t("DELETE")} onClick={() => void deleteAccount()}>{t("Delete account and data")}</Button></div>
          </section>
          {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
        </div>
      </details>
    </CardContent>
  </Card>;
}
