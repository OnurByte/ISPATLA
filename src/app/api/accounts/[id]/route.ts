import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { canonicalCategorySlugs, deleteAccount, getAccounts, saveAccount, writingSkillIds } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { revokeXAccount } from "@/server/x-oauth";
import { validateStyleProfilePatch } from "@/components/style-profile-json";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const current = getAccounts().find((account) => account.id === id);
  if (!current) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  try {
    const body = await readJsonBody(request);
    let styleProfile: Record<string, unknown> | undefined;
    if (body.styleProfile !== undefined && body.styleProfile !== null) {
      if (typeof body.styleProfile !== "object" || Array.isArray(body.styleProfile)) {
        return NextResponse.json({ error: "styleProfile bir JSON nesnesi olmalı" }, { status: 422 });
      }
      try {
        styleProfile = validateStyleProfilePatch(body.styleProfile, current.styleProfile);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "styleProfile geçersiz" }, { status: 422 });
      }
      if ("categories" in styleProfile && !canonicalCategorySlugs(styleProfile.categories)) return NextResponse.json({ error: "account kategorileri katalogdan seçilmeli" }, { status: 422 });
      if ("writingSkillIds" in styleProfile && !writingSkillIds(styleProfile.writingSkillIds)) return NextResponse.json({ error: "writing skill seçimi geçersiz" }, { status: 422 });
    }
    const account = saveAccount({
      id,
      // OAuth owns provider identity; this endpoint only edits editorial settings.
      accountKey: current.accountKey,
      handle: current.handle,
      displayName: current.displayName,
      enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
      defaultAccount: body.defaultAccount === undefined ? current.defaultAccount : body.defaultAccount === true,
      automationMode: "manual",
      dailyLimit: Math.min(100, Math.max(1, Number(body.dailyLimit ?? current.dailyLimit))),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((item): item is string => typeof item === "string") : current.capabilities,
      styleProfile: styleProfile || current.styleProfile,
      now: Math.floor(Date.now() / 1000),
    });
    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "account güncellenemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!getAccounts().some((account) => account.id === id)) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  const revocation = await revokeXAccount({ accountId: id, ownerUserId: currentOwnerId()! });
  deleteAccount(id);
  return NextResponse.json({ ok: true, providerRevoked: revocation.providerRevoked });
}

export const PATCH = withUser(PATCHHandler);

export const DELETE = withUser(DELETEHandler);
