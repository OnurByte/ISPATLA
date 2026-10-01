import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";
import { verifyXApiCredentials, xApiConfigStatus } from "@/server/x-api";

export const runtime = "nodejs";

/**
 * GET needs no mutation guard: it reports what is configured and whether the
 * stored credential still works. It never returns the credential itself.
 */
export async function GET() {
  const status = xApiConfigStatus();
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await verifyXApiCredentials());
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode: null, identity: "", detail: error instanceof Error ? error.message : "doğrulanamadı" },
      { status: 424 },
    );
  }
}
