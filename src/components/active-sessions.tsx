"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Session = { id: string; token: string; createdAt: string; updatedAt: string; userAgent?: string | null; current: boolean };

function sessionName(userAgent?: string | null) {
  const ua = userAgent || "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Bilinmeyen tarayıcı";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "cihaz";
  return `${browser} · ${os}`;
}

export function ActiveSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/sessions", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      setSessions(await response.json());
    }).catch(() => setError("Oturumlar yüklenemedi."));
  }, []);

  async function revoke(id: string) {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/account/sessions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error();
      setSessions((items) => items.filter((item) => item.id !== id));
    } catch { setError("Oturum sonlandırılamadı. Tekrar deneyebilirsin."); }
    finally { setBusy(null); }
  }

  return <section className="space-y-3 border-t pt-6" aria-labelledby="active-sessions-title">
    <div><h2 id="active-sessions-title" className="text-sm font-medium">Aktif oturumlar</h2><p className="text-sm text-muted-foreground">Hesabının açık olduğu cihazları yönet.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {sessions.length === 0 && !error ? <p className="text-sm text-muted-foreground">Yükleniyor…</p> : <ul className="divide-y rounded-md border bg-card">{sessions.map((session) => <li key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium">{sessionName(session.userAgent)}{session.current && <span className="ml-2 text-xs text-muted-foreground">Bu cihaz</span>}</p><p className="text-xs text-muted-foreground">Son etkinlik: {new Date(session.updatedAt).toLocaleString()}</p></div>
      {!session.current && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => revoke(session.id)}>{busy === session.id ? "Sonlandırılıyor…" : "Oturumu sonlandır"}</Button>}
    </li>)}</ul>}
  </section>;
}
