import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionCookie, splitSessionCookie } from "@/server/auth";
import { resolveSession } from "@/server/auth-store";
import { ensureDatabase } from "@/server/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Sign-in page.
 *
 * The proxy already blocks unauthenticated requests, so arriving here means
 * either no cookie yet or an expired one. The check below only decides whether a
 * stale cookie should be shown the form again or bounced to the dashboard.
 */
export default async function LoginPage() {
  ensureDatabase();

  const parsed = splitSessionCookie(readSessionCookie((await cookies()).toString()));
  if (parsed && resolveSession(parsed.id, parsed.signature)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <LoginForm />
    </main>
  );
}
