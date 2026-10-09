import { NextResponse } from "next/server";
import { getAccounts, getOwnUserProfileXUserId, saveOwnUserProfile } from "@/server/db";
import { readJsonBody } from "@/server/api-guard";
import { validateProfileCompletion } from "@/server/public-profile";
import { loadOwnUserProfileFromX } from "@/server/x-profile-sync";
import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getXAccountAuthState } from "@/server/x-oauth-store";

export const runtime = "nodejs";

export const GET = withUser(async () => NextResponse.json(await loadOwnUserProfileFromX(), { headers: { "cache-control": "no-store" } }));

export const PUT = withUser(async (request: Request) => {
  try {
    validateProfileCompletion(await readJsonBody(request));
    const ownerUserId = currentOwnerId();
    const profileXUserId = getOwnUserProfileXUserId();
    const hasConnectedProfileAccount = ownerUserId && profileXUserId && getAccounts().some((account) => {
      if (account.ownerUserId !== ownerUserId || !account.enabled) return false;
      const connection = getXAccountAuthState(account.id, ownerUserId);
      return connection?.connected === true && connection.xUserId === profileXUserId;
    });
    if (!hasConnectedProfileAccount) {
      return NextResponse.json({ error: "Devam etmek için önce 𝕏 hesabını bağla." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(saveOwnUserProfile(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "profil kaydedilemedi" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
});
