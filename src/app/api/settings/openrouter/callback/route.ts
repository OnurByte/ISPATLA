import { withUser } from "@/server/request-auth";
import { finishOpenRouterOAuth } from "@/server/openrouter-oauth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  const url = new URL(request.url);
  const base = process.env.BETTER_AUTH_URL || url.origin;
  const callbackUrl = new URL("/api/settings/openrouter/callback", base).toString();
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const error = url.searchParams.get("error");
  let result: "connected" | "failed" = "failed";
  try {
    if (!error) {
      await finishOpenRouterOAuth({ state, code, callbackUrl });
      result = "connected";
    }
  } catch { /* Provider details and authorization codes must not reach the browser URL. */ }
  const destination = new URL("/settings/keys", base);
  destination.searchParams.set("openrouter", result);
  return NextResponse.redirect(destination, 303);
}

export const GET = withUser(GETHandler);
