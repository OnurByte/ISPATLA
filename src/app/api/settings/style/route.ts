import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getPostgresWritingStyleSettings, savePostgresWritingStyleSettings } from "@/server/postgres-settings";

export const runtime = "nodejs";

async function GETHandler() {
  return NextResponse.json(await getPostgresWritingStyleSettings());
}

async function PATCHHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    const current = await getPostgresWritingStyleSettings();
    const exampleStyle = body.exampleStyle && typeof body.exampleStyle === "object" && !Array.isArray(body.exampleStyle)
      ? body.exampleStyle as Record<string, unknown>
      : current.exampleStyle;
    const skills = Array.isArray(body.skills) ? body.skills : current.skills;
    return NextResponse.json(await savePostgresWritingStyleSettings({ exampleStyle, skills: skills as typeof current.skills }, Math.floor(Date.now() / 1000)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "stil ayarları kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PATCH = withUser(PATCHHandler);
