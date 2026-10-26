"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { internalPostUrl } from "@/lib/post-url";
import { localizePath, type Locale } from "@/i18n/config";
import { useUiText } from "@/i18n/ui-client";
export function PostActions({ id, saved: initialSaved, locale }: { id: string; saved: boolean; locale: Locale }) {
  const [saved, setSaved] = useState(initialSaved), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const { t } = useUiText();
  async function save() {
    setPending(true); setMessage("");
    try { const response = await fetch(`/api/posts/${id}/saved`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ saved: !saved }) }); if (!response.ok) throw new Error(); setSaved(!saved); }
    catch { setMessage(t("Could not save. Please retry.")); }
    finally { setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(new URL(localizePath(locale, internalPostUrl(id)), window.location.origin).href); setMessage(t("Link copied.")); }
    catch { setMessage(t("Copy the link from the address bar.")); }
  }
  return <><Button variant="outline" onClick={save} disabled={pending}>{saved ? t("Saved") : t("Save")}</Button><Button variant="outline" onClick={copy}>{t("Copy link")}</Button><span role="status" className="self-center text-sm text-muted-foreground">{message}</span></>;
}
