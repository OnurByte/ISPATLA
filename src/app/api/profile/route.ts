import { NextResponse } from "next/server";
import { getOwnUserProfile, saveOwnUserProfile } from "@/server/db";
import { readJsonBody } from "@/server/api-guard";
import { validateProfileUpdate } from "@/server/public-profile";
import { withUser } from "@/server/request-auth";

export const runtime = "nodejs";

export const GET = withUser(() => NextResponse.json(getOwnUserProfile(), { headers: { "cache-control": "no-store" } }));

export const PUT = withUser(async (request: Request) => {
  try {
    const update = validateProfileUpdate(await readJsonBody(request));
    return NextResponse.json(saveOwnUserProfile(update), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "profil kaydedilemedi" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
});
