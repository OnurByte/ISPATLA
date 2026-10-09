"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEFAULT_LOCALE, localizePath, type Locale } from "@/i18n/config"
import { announceSessionChange } from "@/components/auth-session-sync"

type AuthFormMode = "login" | "signup" | "forgot" | "reset"

const copy: Record<AuthFormMode, { title: string; description: string; button: string }> = {
  login: { title: "Giriş yap", description: "Fırsatlarına, taslaklarına ve sonuçlarına devam et.", button: "Giriş yap" },
  signup: { title: "Hesap oluştur", description: "Hesabını oluştur ve sana uygun fırsatları keşfet.", button: "Hesap oluştur" },
  forgot: { title: "Şifreni sıfırla", description: "Sıfırlama bağlantısını e-posta adresine gönderelim.", button: "Bağlantı gönder" },
  reset: { title: "Yeni şifre belirle", description: "Hesabın için yeni bir şifre seç.", button: "Şifreyi güncelle" },
}

function responseError(data: unknown): string {
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message
  return "İşlem tamamlanamadı. Bilgilerini kontrol edip yeniden dene."
}

export function AuthForm({ mode, token, locale = DEFAULT_LOCALE, xLoginEnabled = false, xLoginError = false }: { mode: AuthFormMode; token?: string; locale?: Locale; xLoginEnabled?: boolean; xLoginError?: boolean }) {
  const path = (href: string) => localizePath(locale, href)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function continueWithX(endpoint: string, callbackURL: string, errorCallbackURL: string) {
    setError("")
    setMessage("")
    setPending(true)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "twitter", callbackURL, errorCallbackURL, rememberMe: true }),
      })
      const data = await response.json().catch(() => null) as { url?: unknown } | null
      if (!response.ok || typeof data?.url !== "string") throw new Error("𝕏 ile devam edilemedi. E-posta ile giriş yapabilir veya yeniden deneyebilirsin.")
      const target = new URL(data.url)
      if (target.origin !== "https://x.com" || target.pathname !== "/i/oauth2/authorize") throw new Error("𝕏 giriş bağlantısı doğrulanamadı.")
      window.location.assign(target.href)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "𝕏 ile devam edilemedi. Yeniden dene.")
      setPending(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setPending(true)

    const endpoint = {
      login: "/api/auth/sign-in/email",
      signup: "/api/auth/sign-up/email",
      forgot: "/api/auth/request-password-reset",
      reset: "/api/auth/reset-password",
    }[mode]
    const body = mode === "forgot"
      ? { email, redirectTo: `${window.location.origin}${path("/reset-password")}` }
      : mode === "reset"
        ? { token, newPassword: password }
        : { email, password, rememberMe: true, ...(mode === "signup" ? { name: email.split("@")[0] } : {}) }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(data))

      if (mode === "login" || mode === "signup") {
        announceSessionChange()
        window.location.assign(path("/dashboard"))
      } else if (mode === "forgot") {
        setMessage("Bu adres için bir hesap varsa sıfırlama bağlantısı gönderildi.")
      } else {
        setMessage("Şifren güncellendi. Giriş yapabilirsin.")
        setPassword("")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı. Yeniden dene.")
    } finally {
      setPending(false)
    }
  }

  const fields = mode === "login" || mode === "signup" || mode === "forgot"
  const heading = copy[mode]

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-8 sm:py-12">
      <section className="w-full rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">{heading.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{heading.description}</p>
        {(mode === "login" || mode === "signup") && <div className="mt-6 space-y-2">
          <Button type="button" variant="outline" className="w-full" disabled={pending || !xLoginEnabled} aria-describedby={!xLoginEnabled ? "x-login-unavailable" : undefined} onClick={() => void continueWithX("/api/auth/sign-in/social", path("/dashboard"), path(mode === "signup" ? "/signup" : "/login") + "?x_error=1")}>
            𝕏 ile giriş yap
          </Button>
          {!xLoginEnabled && <p id="x-login-unavailable" className="text-xs text-muted-foreground">Bu kurulumda 𝕏 girişi henüz etkin değil.</p>}
          {xLoginError && <p className="text-sm text-destructive" role="alert">𝕏 girişinde doğrulanmış e-posta alınamadı veya bağlantı tamamlanmadı. E-posta ile devam et ya da 𝕏 hesabında e-posta iznini kontrol et.</p>}
        </div>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          {fields && <div className="space-y-2">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
          </div>}
          {(mode === "login" || mode === "signup" || mode === "reset") && <div className="space-y-2">
            <Label htmlFor="password">{mode === "reset" ? "Yeni şifre" : "Şifre"}</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : mode === "signup" ? "new-password" : "new-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
            {mode !== "login" && <p className="text-xs text-muted-foreground">En az 12 karakter.</p>}
          </div>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
          <Button className="w-full" type="submit" disabled={pending || (mode === "reset" && !token)}>
            {pending ? "Lütfen bekle…" : heading.button}
          </Button>
        </form>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="Hesap bağlantıları">
          {mode !== "login" && <Link className="underline underline-offset-4" href={path("/login")}>Giriş yap</Link>}
          {mode !== "signup" && <Link className="underline underline-offset-4" href={path("/signup")}>Hesap oluştur</Link>}
          {mode !== "forgot" && mode !== "reset" && <Link className="underline underline-offset-4" href={path("/forgot-password")}>Şifremi unuttum</Link>}
          {mode === "reset" && !token && <p className="w-full text-destructive">Sıfırlama bağlantısı geçersiz veya eksik. Yeni bir bağlantı iste.</p>}
        </nav>
      </section>
    </main>
  )
}
