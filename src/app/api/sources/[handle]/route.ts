import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { deleteSource, getStoredSources, recordSourceEvent, upsertSource } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { asIdeology, asIdeologyTags, asNiche, asTone, asTopics } from "@/server/sources";
import { resolveIdeology } from "@/server/ideologies";

export const runtime = "nodejs";

async function PATCHHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  const current = getStoredSources().find((source) => source.handle === handle);
  if (!current) return NextResponse.json({ error: "kaynak bulunamadı" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  if (body.ideology !== undefined && !resolveIdeology(body.ideology)) return NextResponse.json({ error: "ideoloji katalogdan seçilmeli" }, { status: 422 });
  if (body.ideologyTags !== undefined && (Array.isArray(body.ideologyTags) ? body.ideologyTags : String(body.ideologyTags).split(",")).some((value) => !resolveIdeology(value))) return NextResponse.json({ error: "ideoloji etiketleri katalogdan seçilmeli" }, { status: 422 });
  const source = {
    ...current,
    name: String(body.name ?? current.name),
    enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
    maxPosts: Math.min(50, Math.max(1, Number(body.maxPosts ?? current.maxPosts))),
    rightsStatus: body.rightsStatus === "cleared" || body.rightsStatus === "prohibited" ? body.rightsStatus : current.rightsStatus,
    profile: {
      ...current.profile,
      pinned: body.pinned === undefined ? current.profile.pinned === true : body.pinned === true,
      niche: body.niche === undefined ? current.profile.niche : asNiche(body.niche),
      tone: body.tone === undefined ? current.profile.tone : asTone(body.tone),
      topics: body.topics === undefined ? current.profile.topics : asTopics(body.topics, current.profile.topics),
      ideology: body.ideology === undefined ? current.profile.ideology : asIdeology(body.ideology, current.profile.ideology),
      ideologyTags: body.ideologyTags === undefined ? current.profile.ideologyTags : asIdeologyTags(body.ideologyTags, current.profile.ideologyTags),
    },
  };
  upsertSource(source, Math.floor(Date.now() / 1000));
  return NextResponse.json(source);
}

async function DELETEHandler(request: Request, context: { params: Promise<{ handle: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const handle = (await context.params).handle.replace(/^@/, "").toLowerCase();
  const current = getStoredSources().find((source) => source.handle === handle);
  if (current) {
    recordSourceEvent({
      handle,
      event: "deleted",
      score: Number(current.profile.sourceScore || 0),
      reason: "manual delete",
      model: String(current.profile.scoreModel || ""),
      now: Math.floor(Date.now() / 1000),
    });
  }
  deleteSource(handle);
  return NextResponse.json({ ok: true });
}

export const PATCH = withUser(PATCHHandler, true);

export const DELETE = withUser(DELETEHandler, true);
