import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { getOptionalPageUser } from "@/server/page-auth";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  if ((await headers()).get("x-ispatla-route") === "/onboarding") return children;
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* Protected routes enforce authentication below. */ }
  return authenticated ? <AppShell>{children}</AppShell> : children;
}
