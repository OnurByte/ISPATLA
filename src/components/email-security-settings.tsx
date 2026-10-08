"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function EmailSecuritySettings({ email, emailVerified, xLoginEnabled = false, xLoginError = false }: { email: string; emailVerified: boolean; xLoginEnabled?: boolean; xLoginError?: boolean }) {
  const [pending, setPending] = useState(false)
  const [xPending, setXPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [xError, setXError] = useState("")

  async function sendVerification() {
    setPending(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackURL: "/app/settings/security" }),
      })
      if (!response.ok) throw new Error("Doğrulama bağlantısı gönderilemedi. Biraz sonra yeniden dene.")
      setMessage("Doğrulama bağlantısını gönderdik. Gelen kutunu kontrol et.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı. Yeniden dene.")
    } finally {
      setPending(false)
    }
  }

  async function linkXIdentity() {
    setXPending(true)
    setXError("")
    try {
      const response = await fetch("/api/auth/link-social", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "twitter", callbackURL: "/app/settings/security", errorCallbackURL: "/app/settings/security?x_error=1" }),
      })
      const data = await response.json().catch(() => null) as { url?: unknown } | null
      if (!response.ok || typeof data?.url !== "string") throw new Error("X kimliği bağlanamadı. Yeniden giriş yapıp tekrar dene.")
      const target = new URL(data.url)
      if (target.origin !== "https://x.com" || target.pathname !== "/i/oauth2/authorize") throw new Error("X bağlantısı doğrulanamadı.")
      window.location.assign(target.href)
    } catch (caught) {
      setXError(caught instanceof Error ? caught.message : "X kimliği bağlanamadı. Yeniden dene.")
      setXPending(false)
    }
  }

  return <>
    <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="email-security-title">
    <div>
      <h2 id="email-security-title" className="font-semibold">E-posta adresi</h2>
      <p className="mt-1 break-all text-sm text-muted-foreground">{email}</p>
      <p className="mt-2 text-sm" role="status">Durum: {emailVerified ? "Doğrulanmış" : "Doğrulanmamış"}</p>
    </div>
    {!emailVerified && <Button type="button" variant="outline" onClick={() => void sendVerification()} disabled={pending}>
      {pending ? "Gönderiliyor…" : "E-postamı doğrula"}
    </Button>}
    {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {!emailVerified && <p className="text-xs text-muted-foreground">Bağlantı tek kullanımlıktır ve 1 saat içinde sona erer. Şifre sıfırlama için e-posta sahipliğinin ayrıca kanıtlanması gerekir.</p>}
    </section>
  {xLoginEnabled && <section className="space-y-3 rounded-xl border bg-card p-5" aria-labelledby="x-identity-title">
    <div>
      <h2 id="x-identity-title" className="font-semibold">Giriş yöntemleri</h2>
      <p className="mt-1 text-sm text-muted-foreground">X kimliğini hesabına bağla. Bu, yayın izni veya X hesabı analizi bağlantısı oluşturmaz.</p>
    </div>
    {xLoginError && <p className="text-sm text-destructive" role="alert">X kimliği bağlanamadı. Doğrulanmış e-posta paylaşımı gerekli olabilir.</p>}
    {xError && <p className="text-sm text-destructive" role="alert">{xError}</p>}
    <Button type="button" variant="outline" onClick={() => void linkXIdentity()} disabled={xPending}>
      {xPending ? "X’e yönlendiriliyor…" : "X ile giriş kimliği bağla"}
    </Button>
  </section>}
  </>
}
