"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { announceSessionChange } from "@/components/auth-session-sync";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function SignOutButton({ locale, className }: { locale: Locale; className?: string }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(dict.nav.signOutError);
      announceSessionChange();
      router.replace(localizePath(locale, "/"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : dict.nav.signOutError);
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-1">
    <Button type="button" variant="ghost" className={className || "w-full justify-start"} onClick={() => void signOut()} disabled={pending}>
      <LogOut data-icon="inline-start" aria-hidden="true" />{pending ? dict.nav.signOutPending : dict.nav.signOut}
    </Button>
    {error && <p className="px-2 text-xs text-destructive" role="alert">{error}</p>}
  </div>;
}
