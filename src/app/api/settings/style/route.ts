import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getWritingStyleSettings, saveWritingStyleSettings } from "@/server/db";
import { resolveIdeology } from "@/server/ideologies";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

function GETHandler() {
  return NextResponse.json(getWritingStyleSettings());
}

async function PATCHHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const current = getWritingStyleSettings();
    const exampleStyle = body.exampleStyle && typeof body.exampleStyle === "object" && !Array.isArray(body.exampleStyle)
      ? body.exampleStyle as Record<string, unknown>
      : current.exampleStyle;
    if (!resolveIdeology(exampleStyle.ideology)) return NextResponse.json({ error: "örnek post tandansı katalogdan seçilmeli" }, { status: 422 });
    const skills = Array.isArray(body.skills) ? body.skills : current.skills;
    return NextResponse.json(saveWritingStyleSettings({ exampleStyle, skills: skills as typeof current.skills }, Math.floor(Date.now() / 1000)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "stil ayarları kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PATCH = withUser(PATCHHandler);
