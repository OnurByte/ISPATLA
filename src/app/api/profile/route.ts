import { NextResponse } from "next/server";
import { readJsonBody } from "@/server/api-guard";
import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresOwnUserProfile, savePostgresOwnUserProfile } from "@/server/postgres-profile-dashboard";
import { getPostgresAccounts } from "@/server/postgres-accounts";

export const runtime = "nodejs";

export const GET = withUser(async () => NextResponse.json(await getPostgresOwnUserProfile(), { headers: { "cache-control": "no-store" } }));

export const PUT = withUser(async (request: Request) => {
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).length) throw new Error("𝕏 profil bilgileri ispatla.tr üzerinden değiştirilemez");
    const ownerUserId = currentOwnerId();
    const accounts = ownerUserId ? await getPostgresAccounts(ownerUserId) : [];
    if (!accounts.some((account) => account.enabled)) return NextResponse.json({ error: "Önce bir herkese açık 𝕏 hesabı ekleyin." }, { status: 409 });
    return NextResponse.json(await savePostgresOwnUserProfile(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "profil kaydedilemedi" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
});
