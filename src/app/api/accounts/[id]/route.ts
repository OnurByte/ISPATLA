import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { revokeXAccount } from "@/server/x-oauth";
import { validateStyleProfilePatch } from "@/components/style-profile-json";
import { deletePostgresAccount, getPostgresAccount, getPostgresCategoriesForAccount, updatePostgresAccount } from "@/server/postgres-accounts";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const owner = currentOwnerId()!;
  const current = await getPostgresAccount(owner, id);
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
      if ("categories" in styleProfile) {
        const allowed = new Set((await getPostgresCategoriesForAccount(owner, id)).map((category) => category.slug));
        const slugs = Array.isArray(styleProfile.categories) ? [...new Set(styleProfile.categories.map(String).map((slug) => slug.trim().toLowerCase()).filter(Boolean))].slice(0, 12) : [];
        if (!Array.isArray(styleProfile.categories) || slugs.some((slug) => !allowed.has(slug))) return NextResponse.json({ error: "account kategorileri katalogdan seçilmeli" }, { status: 422 });
        styleProfile.categories = slugs;
      }
      if ("writingSkillIds" in styleProfile && (!Array.isArray(styleProfile.writingSkillIds) || styleProfile.writingSkillIds.some((item) => !["newsroom-style", "humanize-writing"].includes(String(item))))) return NextResponse.json({ error: "writing skill seçimi geçersiz" }, { status: 422 });
    }
    const dailyLimit = Number(body.dailyLimit ?? current.dailyLimit);
    if (!Number.isFinite(dailyLimit)) return NextResponse.json({ error: "dailyLimit geçersiz" }, { status: 422 });
    const account = await updatePostgresAccount({ owner, id,
      enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
      defaultAccount: body.defaultAccount === undefined ? current.defaultAccount : body.defaultAccount === true,
      dailyLimit: Math.min(100, Math.max(1, dailyLimit)),
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((item): item is string => typeof item === "string") : current.capabilities,
      styleProfile: styleProfile || current.styleProfile });
    if (!account) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "account güncellenemedi" }, { status: 400 });
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const owner = currentOwnerId()!;
  if (!await getPostgresAccount(owner, id)) return NextResponse.json({ error: "account bulunamadı" }, { status: 404 });
  const revocation = await revokeXAccount({ accountId: id, ownerUserId: owner });
  if (!await deletePostgresAccount(owner, id)) return NextResponse.json({ error: "account silinemedi" }, { status: 500 });
  return NextResponse.json({ ok: true, providerRevoked: revocation.providerRevoked });
}

export const PATCH = withUser(PATCHHandler);

export const DELETE = withUser(DELETEHandler);
