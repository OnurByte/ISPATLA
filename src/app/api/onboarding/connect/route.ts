import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { removeSecret, saveSecret } from "@/server/vault";
import {
  completeXAuthorization,
  startXAuthorization,
  storeManualOAuthToken,
  verifyXApiCredentials,
  xApiConfigStatus,
  X_ACCESS_SECRET,
  X_BEARER_SECRET,
  X_CLIENT_ID_SECRET,
  X_CLIENT_SECRET_SECRET,
} from "@/server/x-api";

export const runtime = "nodejs";

/**
 * One endpoint for all three ways of connecting to X, because the onboarding
 * screen offers them as three tabs over the same outcome and splitting them into
 * separate calls would mean the screen had to know which transport it just used.
 *
 *   method: "bearer"            value: project bearer token
 *   method: "oauth-client"      clientId + clientSecret
 *   method: "oauth-manual"      accessToken (+ optional refreshToken/expiresIn)
 *   method: "oauth-start"       -> { authorizeUrl }
 *   method: "oauth-complete"    code + state
 */
export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }

  const method = String(body.method || "");
  const value = String(body.value || "").trim();

  try {
    if (method === "bearer") {
      if (!value) return NextResponse.json({ error: "bearer token boş" }, { status: 400 });
      saveSecret(X_BEARER_SECRET, "X API (Bearer)", value);
      // A pasted OAuth pair is a stronger credential than a bearer; keeping both
      // would make the status lie about which one is in play.
      removeSecret(X_ACCESS_SECRET);
      return NextResponse.json({ ok: true, method, status: xApiConfigStatus() });
    }

    if (method === "oauth-client") {
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();
      if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "client id ve secret gerekli" }, { status: 400 });
      }
      saveSecret(X_CLIENT_ID_SECRET, "X API (OAuth 2.0 client)", clientId);
      saveSecret(X_CLIENT_SECRET_SECRET, "X API (OAuth 2.0 client)", clientSecret);
      return NextResponse.json({ ok: true, method, status: xApiConfigStatus() });
    }

    if (method === "oauth-manual") {
      if (!value) return NextResponse.json({ error: "access token boş" }, { status: 400 });
      storeManualOAuthToken({
        accessToken: value,
        refreshToken: String(body.refreshToken || "").trim() || undefined,
        expiresInSeconds: body.expiresIn ? Number(body.expiresIn) : undefined,
      });
      return NextResponse.json({ ok: true, method, status: xApiConfigStatus() });
    }

    if (method === "oauth-start") {
      const start = await startXAuthorization();
      const state = Buffer.from(JSON.stringify({ v: start.codeVerifier, s: start.state })).toString("base64url");
      const url = new URL(start.authorizeUrl);
      url.searchParams.set("state", state);
      return NextResponse.json({ ok: true, method, authorizeUrl: url.toString() });
    }

    if (method === "oauth-complete") {
      const code = String(body.code || "");
      const state = String(body.state || "");
      let verifier = "";
      let expectedState = "";
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { v?: string; s?: string };
        verifier = String(decoded.v || "");
        expectedState = String(decoded.s || "");
      } catch {
        return NextResponse.json({ error: "state çözülemedi" }, { status: 400 });
      }
      const credentials = await completeXAuthorization({ code, state, codeVerifier: verifier, expectedState });
      return NextResponse.json({ ok: true, method, mode: credentials.mode, status: xApiConfigStatus() });
    }

    return NextResponse.json({ error: "bilinmeyen yöntem" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, method, error: error instanceof Error ? error.message : "bağlantı kurulamadı" },
      { status: 424 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  removeSecret(X_ACCESS_SECRET);
  removeSecret(X_BEARER_SECRET);
  removeSecret(X_CLIENT_ID_SECRET);
  removeSecret(X_CLIENT_SECRET_SECRET);
  return NextResponse.json({ ok: true, cleared: true, status: xApiConfigStatus(), verify: await verifyXApiCredentials() });
}