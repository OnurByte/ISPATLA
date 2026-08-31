import { NextResponse } from "next/server";
import { getDeletedSources, getTechnicalSourceWarnings, recordSourceEvent, upsertSource } from "@/server/db";
import { asIdeology, asIdeologyTags, asNiche, asTone, asTopics, loadSources } from "@/server/sources";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { checkSourceLiveness, recoverTechnicalSources } from "@/server/pipeline";
import { resolveIdeology } from "@/server/ideologies";

export const runtime = "nodejs";

export function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  return NextResponse.json(view === "deleted" ? getDeletedSources() : view === "warnings" ? getTechnicalSourceWarnings() : loadSources());
}

export async function POST(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    if (body.action === "check_liveness") return NextResponse.json(await checkSourceLiveness(Math.floor(Date.now() / 1000), body.onlyUnknown === true));
    if (body.action === "recover_technical") return NextResponse.json(await recoverTechnicalSources(Math.floor(Date.now() / 1000)));
    const handle = String(body.handle || "").replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) return NextResponse.json({ error: "geçerli X handle gerekli" }, { status: 400 });
    if (body.action === "restore_deleted") {
      const deleted = getTechnicalSourceWarnings(200).find((item) => item.handle === handle);
      if (!deleted || !/(?:feed )?profil kimliği (?:eşleşmedi|doğrulanamadı)/iu.test(deleted.reason)) return NextResponse.json({ error: "yalnız kimlik uyuşmazlığıyla elenen kaynaklar otomatik geri alınabilir" }, { status: 422 });
      const now = Math.floor(Date.now() / 1000);
      upsertSource({ handle, name: String(body.name || handle), enabled: true, maxPosts: 20, rightsStatus: "unknown", profile: { origin: "manual", status: "active", pinned: true } }, now);
      recordSourceEvent({ handle, event: "restored", score: deleted.score, reason: "identity mismatch auto-fix", model: "source-restore", now });
      return NextResponse.json({ ok: true, source: (await loadSources()).find((source) => source.handle === handle) });
    }
    if (body.ideology !== undefined && !resolveIdeology(body.ideology)) return NextResponse.json({ error: "ideoloji katalogdan seçilmeli" }, { status: 422 });
    if (body.ideologyTags !== undefined && (Array.isArray(body.ideologyTags) ? body.ideologyTags : String(body.ideologyTags).split(",")).some((value) => !resolveIdeology(value))) return NextResponse.json({ error: "ideoloji etiketleri katalogdan seçilmeli" }, { status: 422 });
    const source = {
      handle,
      name: String(body.name || handle),
      enabled: body.enabled !== false,
      maxPosts: Math.min(50, Math.max(1, Number(body.maxPosts || 20))),
      rightsStatus: body.rightsStatus === "cleared" || body.rightsStatus === "prohibited" ? body.rightsStatus : "unknown",
      profile: {
        origin: "manual",
        status: "active",
        pinned: true,
        niche: asNiche(body.niche),
        tone: asTone(body.tone),
        topics: asTopics(body.topics),
        ideology: asIdeology(body.ideology),
        ideologyTags: asIdeologyTags(body.ideologyTags),
      },
    } as const;
    upsertSource(source, Math.floor(Date.now() / 1000));
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "kaynak kaydedilemedi" }, { status: 400 });
  }
}
