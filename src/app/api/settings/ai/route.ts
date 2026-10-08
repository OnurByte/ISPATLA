import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { detectCodex, getAiSettings, getCompatibleSettings, isAiEnabled, modelOptions, setAiEnabled, setAiSettings, setCompatibleSettings } from "@/server/ai";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { secretOrEnv } from "@/server/vault";

export const runtime = "nodejs";

function payload() {
  const settings = getAiSettings();
  const codex = detectCodex();
  const apiConfigured = Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY"));
  const compatibleConfigured = Boolean(secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY"));
  return {
    settings,
    enabled: isAiEnabled(),
    configured: settings.provider === "codex" ? codex.authenticated : settings.provider === "compatible" ? Boolean(settings.model && getCompatibleSettings().baseUrl && compatibleConfigured) : apiConfigured,
    apiConfigured,
    compatibleConfigured,
    compatible: getCompatibleSettings(),
    models: { api: modelOptions("api"), compatible: modelOptions("compatible"), codex: modelOptions("codex") },
    codex,
  };
}

function GETHandler() {
  return NextResponse.json(payload());
}

async function PUTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 });
  }
  try {
    const current = getAiSettings();
    if ("provider" in body || "model" in body) {
      setAiSettings(String(body.provider ?? current.provider), String(body.model ?? current.model));
    }
    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean") throw new Error("AI enabled değeri boolean olmalı");
      setAiEnabled(body.enabled);
    }
    if ("compatibleBaseUrl" in body || "compatibleName" in body) {
      const currentCompatible = getCompatibleSettings();
      setCompatibleSettings(String(body.compatibleBaseUrl ?? currentCompatible.baseUrl), String(body.compatibleName ?? currentCompatible.name));
    }
    return NextResponse.json(payload());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI ayarı kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);
