"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { internalPostUrl } from "@/lib/post-url";
import { localizePath, type Locale } from "@/i18n/config";
export function PostActions({ id, saved: initialSaved, locale }: { id: string; saved: boolean; locale: Locale }) {
  const [saved, setSaved] = useState(initialSaved), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const tr = locale === "tr";
  async function save() {
    setPending(true); setMessage("");
    try { const response = await fetch(`/api/posts/${id}/saved`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ saved: !saved }) }); if (!response.ok) throw new Error(); setSaved(!saved); }
    catch { setMessage(tr ? "Kaydedilemedi. Tekrar deneyin." : "Could not save. Please retry."); }
    finally { setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(new URL(localizePath(locale, internalPostUrl(id)), window.location.origin).href); setMessage(tr ? "Bağlantı kopyalandı." : "Link copied."); }
    catch { setMessage(tr ? "Bağlantıyı adres çubuğundan kopyalayabilirsiniz." : "Copy the link from the address bar."); }
  }
  return <><Button variant="outline" onClick={save} disabled={pending}>{saved ? (tr ? "Kaydedildi" : "Saved") : (tr ? "Kaydet" : "Save")}</Button><Button variant="outline" onClick={copy}>{tr ? "Bağlantıyı kopyala" : "Copy link"}</Button><span role="status" className="self-center text-sm text-muted-foreground">{message}</span></>;
}
