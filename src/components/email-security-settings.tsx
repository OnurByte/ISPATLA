"use client";
import { useState } from "react";
import { localizePath } from "@/i18n/config";
import { useUiText } from "@/i18n/ui-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function EmailSecuritySettings({ email, emailVerified }: { email: string; emailVerified: boolean; xLoginEnabled?: boolean; xLoginError?: boolean }) {
  const { locale, t } = useUiText();
  const synthetic = email.endsWith(".invalid");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function call(endpoint: string, body: object) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(t("The action could not be completed. Check the address, or reset your existing password."));
      setPassword("");
      setMessage(endpoint.endsWith("password") ? t("Your sign-in password was saved.") : t("Open the verification link in your new email inbox, then refresh this page."));
    } catch (cause) { setMessage(cause instanceof Error ? t(cause.message) : t("The action could not be completed.")); }
    finally { setPending(false); }
  }
  return <Card><CardHeader><CardTitle>{t("Email and sign-in password")}</CardTitle><CardDescription>{synthetic ? t("Verify a real email address and set a password for your account that previously used 𝕏 sign-in. Your current session is preserved.") : email}</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><p className="text-sm">{emailVerified && !synthetic ? t("Email verified.") : t("A real email address needs to be verified.")}</p><form onSubmit={(event) => { event.preventDefault(); void call("/api/auth/change-email", { newEmail, callbackURL: localizePath(locale, "/settings/security") }); }}><FieldGroup><Field><FieldLabel htmlFor="recovery-email">{t("Email address")}</FieldLabel><Input id="recovery-email" type="email" autoComplete="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /><FieldDescription>{t("Your current email remains until the new address is verified.")}</FieldDescription></Field><Button disabled={pending} type="submit">{t("Verify address")}</Button></FieldGroup></form>{!synthetic && !emailVerified && <Button variant="outline" disabled={pending} onClick={() => void call("/api/auth/send-verification-email", { email, callbackURL: localizePath(locale, "/settings/security") })}>{t("Verify current address")}</Button>}{!synthetic && emailVerified && <form onSubmit={(event) => { event.preventDefault(); void call("/api/account/password", { password }); }}><FieldGroup><Field><FieldLabel htmlFor="first-password">{t("Create sign-in password")}</FieldLabel><Input id="first-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><FieldDescription>{t("This form is for accounts that do not have a password yet.")}</FieldDescription></Field><Button disabled={pending} type="submit">{t("Save password")}</Button></FieldGroup></form>}{message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}</CardContent></Card>;
}
