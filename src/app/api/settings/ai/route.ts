import { getChatGPTConnectionStatus } from "@/server/chatgpt-connection";
import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { aiConfigured, aiModelCapabilities, canUseCodexProvider, codexCapabilityForCurrentContext, getAiSettings, getCompatibleSettings, isAiEnabled, modelOptions, setAiEnabled, setAiSettings, setCompatibleSettings } from "@/server/ai";
import { getAiBudgetStatus, getUsageSummary, setSetting } from "@/server/db";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { secretOrEnv } from "@/server/vault";
import { openRouterConnected, OPENROUTER_MODEL_SUGGESTIONS } from "@/server/openrouter-oauth";

export const runtime = "nodejs";

function payload() {
  const date = new Date();
  const monthStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
  const settings = getAiSettings();
  const codexAllowed = canUseCodexProvider();
  const codex = codexCapabilityForCurrentContext();
  const apiConfigured = Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY"));
  const compatibleConfigured = Boolean(secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY"));
  return {
    settings,
    enabled: isAiEnabled(),
    configured: aiConfigured(settings),
    apiConfigured,
    anthropicConfigured: Boolean(secretOrEnv("anthropic_api_key", "ANTHROPIC_API_KEY")),
    compatibleConfigured,
    openrouterConfigured: openRouterConnected(),
    compatibleCapabilityVerified: settings.provider === "compatible" && Boolean(aiModelCapabilities("compatible", settings.model)),
    compatible: getCompatibleSettings(),
    chatgpt: { ...getChatGPTConnectionStatus(), available: process.env.NODE_ENV !== "production" },
      models: { chatgpt: modelOptions("chatgpt"), anthropic: modelOptions("anthropic"), api: modelOptions("api"), compatible: modelOptions("compatible"), codex: codexAllowed ? modelOptions("codex") : [], openrouter: OPENROUTER_MODEL_SUGGESTIONS },
    codex,
    codexAllowed,
    budget: getAiBudgetStatus(),
    usage: getUsageSummary(monthStart),
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
      const provider = String(body.provider ?? current.provider);
      if (provider === "codex" && !canUseCodexProvider()) {
        return NextResponse.json({ error: "Codex CLI is unavailable in this production context." }, { status: 403 });
      }
      setAiSettings(provider, String(body.model ?? current.model));
    }
    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean") throw new Error("AI enabled değeri boolean olmalı");
      setAiEnabled(body.enabled);
    }
    if ("compatibleBaseUrl" in body || "compatibleName" in body) {
      const currentCompatible = getCompatibleSettings();
      setCompatibleSettings(String(body.compatibleBaseUrl ?? currentCompatible.baseUrl), String(body.compatibleName ?? currentCompatible.name));
    }
    for (const [field, setting] of [["dailyBudgetUsd", "ai_daily_budget_usd"], ["monthlyBudgetUsd", "ai_monthly_budget_usd"]] as const) {
      if (!(field in body)) continue;
      const value = typeof body[field] === "number" ? body[field] : Number(body[field]);
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("Bütçe 0 ile 1.000.000 USD arasında olmalı; 0 sınırsızdır.");
      setSetting(setting, String(value), Math.floor(Date.now() / 1000));
    }
    return NextResponse.json(payload());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI ayarı kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);
