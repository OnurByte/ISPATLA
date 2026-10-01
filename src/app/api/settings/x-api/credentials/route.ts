import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { removeSecret, saveSecret } from "@/server/vault";
import { verifyXApiCredentials, xApiConfigStatus, X_ACCESS_SECRET, X_BEARER_SECRET, X_CLIENT_ID_SECRET, X_CLIENT_SECRET_SECRET } from "@/server/x-api";

export const runtime = "nodejs";

const WRITABLE: Record<string, string> = {
  bearer: X_BEARER_SECRET,
  clientId: X_CLIENT_ID_SECRET,
  clientSecret: X_CLIENT_SECRET_SECRET,
};

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const field = String(body.field || "");
  const secretName = WRITABLE[field];
  if (!secretName) {
    return NextResponse.json({ error: "alan bilinmiyor (bearer, clientId, clientSecret)" }, { status: 400 });
  }

  // An empty value means "forget", which is the only way to clear a credential
  // from the UI — PATCH-with-null would be ambiguous with "left unchanged".
  if (body.clear === true) {
    removeSecret(secretName);
    return NextResponse.json({ ok: true, cleared: secretName, status: xApiConfigStatus() });
  }

  const value = String(body.value || "").trim();
  if (!value) {
    return NextResponse.json({ error: "değer boş" }, { status: 400 });
  }
  saveSecret(secretName, field === "bearer" ? "X API (Bearer)" : "X API (OAuth 2.0 client)", value);
  return NextResponse.json({ ok: true, saved: secretName, status: xApiConfigStatus() });
}

/**
 * Clears the OAuth token pair. Bearer and client credentials survive, so the
 * panel falls back to read-only rather than to nothing.
 */
export async function DELETE(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  removeSecret(X_ACCESS_SECRET);
  return NextResponse.json({ ok: true, status: xApiConfigStatus() });
}

/** Live check after a save, so the UI can say "works" instead of "stored". */
export async function PUT(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  void readJsonBody(request);
  return NextResponse.json(await verifyXApiCredentials());
}
