import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";
import { startXAuthorization } from "@/server/x-api";

export const runtime = "nodejs";

// The PKCE verifier has to survive the round trip through X, so it is signed into
// the `state` parameter rather than kept in a session this request does not have.
export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const start = await startXAuthorization();
    const state = Buffer.from(JSON.stringify({ v: start.codeVerifier, s: start.state })).toString("base64url");
    const url = new URL(start.authorizeUrl);
    url.searchParams.set("state", state);
    return NextResponse.json({ authorizeUrl: url.toString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OAuth başlatılamadı" },
      { status: 424 },
    );
  }
}
