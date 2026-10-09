"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AccountLifecycleControls() {
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
      if (!response.ok) throw new Error(result.error || "Hesap devre dışı bırakılamadı.");
      setMessage("Hesap devre dışı bırakıldı. Açmak için yeniden giriş yapabilirsin.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Hesap devre dışı bırakılamadı."); }
    finally { setPending(false); }
  }

  async function deleteAccount() {
    if (confirmation.trim() !== "SİL") return setMessage("Devam etmek için onay alanına SİL yaz.");
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/auth/delete-user", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "Hesap silinemedi. Yeniden giriş yapıp tekrar dene.");
      setMessage("Hesap ve bağlı veriler silindi. Giriş sayfasına yönlendiriliyorsun.");
      window.setTimeout(() => { router.replace("/login"); router.refresh(); }, 900);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Hesap silinemedi."); }
    finally { setPending(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Hesap işlemleri</CardTitle><CardDescription>Hesabını geçici olarak kapatabilir veya kalıcı olarak silebilirsin.</CardDescription></CardHeader>
    <CardContent>
      <details className="group rounded-md border px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Hesap işlemlerini aç</summary>
        <div className="mt-4 flex flex-col gap-5 border-t pt-4">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-sm font-medium">Hesabı devre dışı bırak</h3><p className="text-sm text-muted-foreground">Oturumların kapatılır; e-posta veya 𝕏 ile yeniden giriş yaparak hesabı açabilirsin.</p></div>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void disable()}>Hesabı kapat</Button>
          </section>
          <section className="flex flex-col gap-3 border-t pt-4">
            <div><h3 className="text-sm font-medium">Hesabı kalıcı olarak sil</h3><p className="text-sm text-muted-foreground">Hesap verilerin ve bağlı kayıtların silinir. Bu işlem geri alınamaz. E-posta hesabın varsa parolanı gir; yalnızca 𝕏 ile giriş yapıyorsan yakın zamanda tekrar giriş yapmış olman gerekir.</p></div>
            <label htmlFor="account-delete-password" className="text-sm font-medium">Parola <span className="font-normal text-muted-foreground">(e-posta hesabı için; 𝕏 ile girişte boş bırak)</span></label>
            <Input id="account-delete-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <label htmlFor="account-delete-confirmation" className="text-sm font-medium">Onaylamak için SİL yaz</label>
            <Input id="account-delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            <div><Button type="button" variant="destructive" disabled={pending || confirmation.trim() !== "SİL"} onClick={() => void deleteAccount()}>Hesabı ve verileri sil</Button></div>
          </section>
          {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
        </div>
      </details>
    </CardContent>
  </Card>;
}
