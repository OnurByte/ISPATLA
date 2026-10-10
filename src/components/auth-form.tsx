"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEFAULT_LOCALE, localizePath, type Locale } from "@/i18n/config"
import { announceSessionChange } from "@/components/auth-session-sync"
import { authCopy } from "@/i18n/auth-copy"
import { getDictionary } from "@/i18n/dictionaries"

type AuthFormMode = "login" | "signup" | "forgot" | "reset"

function responseError(data: unknown, fallback: string): string {
  // API errors may not be translated; use the localized fallback unless a local
  // translation exists. Do not expose raw provider responses as UI translations.
  if (data && typeof data === "object" && "code" in data && data.code === "INVALID_EMAIL") return fallback;
  return fallback;
}


export function AuthForm({ mode, token, locale = DEFAULT_LOCALE, next = "/dashboard", xLoginEnabled = false, xLoginError = false }: { mode: AuthFormMode; token?: string; locale?: Locale; next?: string; xLoginEnabled?: boolean; xLoginError?: boolean | string }) {
  const path = (href: string) => localizePath(locale, href)
  const words = authCopy[locale]
  const navigation = getDictionary(locale).nav
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
        body: JSON.stringify({ provider: "twitter", callbackURL: mode === "login" ? next : callbackURL, errorCallbackURL, rememberMe: true }),
      })
      const data = await response.json().catch(() => null) as { url?: unknown } | null
      if (!response.ok || typeof data?.url !== "string") throw new Error(words.xContinueError)
      const target = new URL(data.url)
      if (target.origin !== "https://x.com" || target.pathname !== "/i/oauth2/authorize") throw new Error(words.xBadUrl)
      window.location.assign(target.href)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : words.xContinueError)
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
      if (!response.ok) throw new Error(responseError(data, words.genericError))

      if (mode === "login" || mode === "signup") {
        announceSessionChange()
        window.location.assign(next)
      } else if (mode === "forgot") {
        setMessage(words.resetSent)
      } else {
        setMessage(words.passwordUpdated)
        setPassword("")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : words.genericError)
    } finally {
      setPending(false)
    }
  }

  const fields = mode === "login" || mode === "signup" || mode === "forgot"
  const heading = {
    login: { title: navigation.login, description: words.loginDesc, button: navigation.login },
    signup: { title: navigation.start, description: words.signupDesc, button: navigation.start },
    forgot: { title: words.forgotTitle, description: words.forgotDesc, button: words.forgotButton },
    reset: { title: words.resetTitle, description: words.resetDesc, button: words.resetButton },
  }[mode]

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-8 sm:py-12">
      <section className="w-full rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">{heading.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{heading.description}</p>
        {(mode === "login" || mode === "signup") && <div className="mt-6 space-y-2">
          <Button type="button" variant="outline" className="w-full" disabled={pending || !xLoginEnabled} aria-describedby={!xLoginEnabled ? "x-login-unavailable" : undefined} onClick={() => void continueWithX("/api/auth/sign-in/social", next, path(mode === "signup" ? "/signup" : "/login") + "?x_error=1" + (mode === "login" ? `&next=${encodeURIComponent(next)}` : ""))}>
            {words.withX}
          </Button>
          {!xLoginEnabled && <p id="x-login-unavailable" className="text-xs text-muted-foreground">{words.xUnavailable}</p>}
          {xLoginError && <p className="text-sm text-destructive" role="alert">{xLoginError === "email_not_found" ? words.xEmailMissing : xLoginError === "unable_to_get_user_info" ? words.xProfileMissing : words.xFailure}</p>}
        </div>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          {fields && <div className="space-y-2">
            <Label htmlFor="email">{words.email}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
          </div>}
          {(mode === "login" || mode === "signup" || mode === "reset") && <div className="space-y-2">
            <Label htmlFor="password">{mode === "reset" ? words.newPassword : words.password}</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : mode === "signup" ? "new-password" : "new-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
            {mode !== "login" && <p className="text-xs text-muted-foreground">{words.minLength}</p>}
          </div>}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
          <Button className="w-full" type="submit" disabled={pending || (mode === "reset" && !token)}>
            {pending ? words.wait : heading.button}
          </Button>
        </form>
        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label={words.links}>
          {mode !== "login" && <Link className="underline underline-offset-4" href={path("/login")}>{navigation.login}</Link>}
          {mode !== "signup" && <Link className="underline underline-offset-4" href={path("/signup")}>{navigation.start}</Link>}
          {mode !== "forgot" && mode !== "reset" && <Link className="underline underline-offset-4" href={path("/forgot-password")}>{words.forgotLink}</Link>}
          {mode === "reset" && !token && <p className="w-full text-destructive">{words.missingToken}</p>}
        </nav>
      </section>
    </main>
  )
}
