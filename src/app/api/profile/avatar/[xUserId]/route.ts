import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { getProfileAvatarAccess } from "@/server/db";
import { profileAvatarFile } from "@/server/profile-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ xUserId: string }> }) {
  const { xUserId } = await context.params;
  if (!/^\d{1,32}$/.test(xUserId)) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  let ownerUserId: string | undefined;
  try { ownerUserId = (await requireSession(request))?.user.id; } catch { /* Public completed profiles remain readable if auth storage is unavailable. */ }
  try {
    if (!getProfileAvatarAccess(xUserId, ownerUserId)) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    const file = await profileAvatarFile(xUserId);
    if (!file) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
    const bytes = await readFile(file.path);
    return new Response(bytes, { headers: { "content-type": file.mime, "content-length": String(bytes.byteLength), "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Avatar unavailable" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
}
