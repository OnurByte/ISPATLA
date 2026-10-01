import { NextResponse } from "next/server";
import { completeXAuthorization } from "@/server/x-api";

export const runtime = "nodejs";

/**
 * X redirects here with ?code&state. The verifier travels inside the signed
 * state blob so no session cookie is required — the browser that started the
 * flow is not guaranteed to be the one that returns (it may be a different
 * device), and the PKCE verifier is what actually binds the exchange.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const denied = url.searchParams.get("denied");

  if (denied) {
    return NextResponse.json({ ok: false, detail: "Yetkilendirme reddedildi" }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ ok: false, detail: "Kod parametresi yok" }, { status: 400 });
  }

  let verifier = "";
  let expectedState = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { v?: string; s?: string };
    verifier = String(decoded.v || "");
    expectedState = String(decoded.s || "");
  } catch {
    return NextResponse.json({ ok: false, detail: "state çözülemedi" }, { status: 400 });
  }

  try {
    const credentials = await completeXAuthorization({ code, state, codeVerifier: verifier, expectedState });
    return NextResponse.json({ ok: true, mode: credentials.mode, hasRefreshToken: Boolean(credentials.refreshToken) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, detail: error instanceof Error ? error.message : "token değişimi başarısız" },
      { status: 424 },
    );
  }
}
