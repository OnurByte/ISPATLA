"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SESSION_CHANGE_KEY = "ispatla:auth-session-change";
const SESSION_CHANNEL = "ispatla-auth-session";

export function announceSessionChange() {
  try {
    localStorage.setItem(SESSION_CHANGE_KEY, `${Date.now()}-${Math.random()}`);
  } catch {
    try {
      const channel = new BroadcastChannel(SESSION_CHANNEL);
      channel.postMessage("changed");
      channel.close();
    } catch { /* The current tab still refreshes its own route after auth changes. */ }
  }
}

export function AuthSessionSync() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_CHANGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);

    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(SESSION_CHANNEL);
      channel.addEventListener("message", refresh);
    } catch { /* Storage events remain the fallback. */ }

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      channel?.removeEventListener("message", refresh);
      channel?.close();
    };
  }, [router]);

  return null;
}
