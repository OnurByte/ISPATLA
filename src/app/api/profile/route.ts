import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api-guard";
import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresOwnUserProfile, savePostgresOwnUserProfile } from "@/server/postgres-profile-dashboard";
import { getPostgresXAccounts, isPostgresXAccountConnectedAndProfileIdentity } from "@/server/postgres-x-oauth";

export const runtime = "nodejs";

export const GET = withUser(async () => NextResponse.json(await getPostgresOwnUserProfile(), { headers: { "cache-control": "no-store" } }));

export const PUT = withUser(async (request: Request) => {
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).length) throw new Error("X profil bilgileri Ispatla üzerinden değiştirilemez");
    const ownerUserId = currentOwnerId();
    const connectedAccounts = ownerUserId
      ? (await getPostgresXAccounts(ownerUserId)).filter((account) => account.enabled && account.connected)
      : [];
    let hasConnectedProfileAccount = false;
    for (const account of connectedAccounts) {
      if (await isPostgresXAccountConnectedAndProfileIdentity(account.id, ownerUserId!)) {
        hasConnectedProfileAccount = true;
        break;
      }
    }
    if (!hasConnectedProfileAccount) {
      return NextResponse.json({ error: "Devam etmek için önce 𝕏 hesabını bağla." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(await savePostgresOwnUserProfile(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "profil kaydedilemedi" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
});
