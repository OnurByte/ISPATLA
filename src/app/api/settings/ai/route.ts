import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getPostgresAiBudgetStatus, getPostgresUsageSummary, getPostgresSecretValue, setPostgresSetting } from "@/server/postgres-settings";
import { aiConfigured, aiModelCapabilities, canUseCodexProvider, codexCapabilityForCurrentContext, getAiSettings, getCompatibleSettings, isAiEnabled, listChatGPTModels, modelOptions, setAiEnabled, setAiSettings, setCompatibleSettings } from "@/server/ai";
import { getChatGPTConnectionStatus } from "@/server/chatgpt-connection";

export const runtime = "nodejs";

const monthStart = () => {
  const date = new Date();
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
};

async function payload() {
  const [settings, enabled, compatible, budget, usage, codex, chatgpt, apiKey, anthropicKey, compatibleKey, openrouterKey] = await Promise.all([
    getAiSettings(), isAiEnabled(), getCompatibleSettings(), getPostgresAiBudgetStatus(), getPostgresUsageSummary(monthStart()),
    Promise.resolve(codexCapabilityForCurrentContext()), getChatGPTConnectionStatus(),
    getPostgresSecretValue("openai_api_key", "OPENAI_API_KEY"), getPostgresSecretValue("anthropic_api_key", "ANTHROPIC_API_KEY"),
    getPostgresSecretValue("compatible_api_key", "AI_COMPATIBLE_API_KEY"), getPostgresSecretValue("openrouter_api_key", "OPENROUTER_API_KEY"),
  ]);
  const configured = await aiConfigured(settings);
  const codexAllowed = canUseCodexProvider();
  return {
    settings, enabled, configured, runtimeAvailable: true,
    providerConfigured: settings.provider === "api" ? Boolean(apiKey) : settings.provider === "anthropic" ? Boolean(anthropicKey) : settings.provider === "compatible" ? Boolean(compatibleKey && compatible.baseUrl) : settings.provider === "openrouter" ? Boolean(openrouterKey) : settings.provider === "chatgpt" ? chatgpt.connected : codexAllowed && codex.authenticated,
    apiConfigured: Boolean(apiKey), anthropicConfigured: Boolean(anthropicKey), compatibleConfigured: Boolean(compatibleKey),
    openrouterConfigured: Boolean(openrouterKey), compatibleCapabilityVerified: settings.provider === "compatible" && Boolean(await aiModelCapabilities("compatible", settings.model)), compatible,
    chatgpt: { ...chatgpt, available: process.env.NODE_ENV !== "production" },
    models: { chatgpt: settings.provider === "chatgpt" ? await listChatGPTModels().catch(() => []) : [], anthropic: modelOptions("anthropic"), api: modelOptions("api"), compatible: [], codex: codexAllowed ? modelOptions("codex") : [], openrouter: [] },
    codex, codexAllowed,
    budget, usage,
  };
}

async function GETHandler() { return NextResponse.json(await payload(), { headers: { "Cache-Control": "no-store" } }); }

async function PUTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); }
  catch { return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 }); }
  const now = Math.floor(Date.now() / 1000);
  try {
    if ("provider" in body || "model" in body) { const current = await getAiSettings(); await setAiSettings(String(body.provider ?? current.provider), String(body.model ?? current.model).trim()); }
    if ("enabled" in body) { if (typeof body.enabled !== "boolean") throw new Error("AI enabled değeri boolean olmalı"); await setAiEnabled(body.enabled); }
    if ("compatibleBaseUrl" in body || "compatibleName" in body) {
      const current = await getCompatibleSettings();
      await setCompatibleSettings(String(body.compatibleBaseUrl ?? current.baseUrl), String(body.compatibleName ?? current.name));
    }
    for (const [field, setting] of [["dailyBudgetUsd", "ai_daily_budget_usd"], ["monthlyBudgetUsd", "ai_monthly_budget_usd"]] as const) {
      if (!(field in body)) continue;
      const value = typeof body[field] === "number" ? body[field] as number : Number(body[field]);
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error("Bütçe 0 ile 1.000.000 USD arasında olmalı; 0 sınırsızdır.");
      await setPostgresSetting(setting, String(value), now);
    }
    return NextResponse.json(await payload());
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI ayarı kaydedilemedi" }, { status: 400 }); }
}

export const GET = withUser(GETHandler);
export const PUT = withUser(PUTHandler);
