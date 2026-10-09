import { getChatGPTConnectionStatus } from "@/server/chatgpt-connection";
import { KeysPage } from "@/components/keys-page";
import { PageHeading } from "@/components/page-heading";
import { aiConfigured, aiModelCapabilities, canUseCodexProvider, codexCapabilityForCurrentContext, getAiSettings, getCompatibleSettings, isAiEnabled, modelOptions } from "@/server/ai";
import { getAiBudgetStatus, getUsageSummary } from "@/server/db";
import { listSecretMetas, secretOrEnv, vaultReady } from "@/server/vault";
import { renderUserPage } from "@/server/page-auth";
import { OPENROUTER_MODEL_SUGGESTIONS, openRouterConnected } from "@/server/openrouter-oauth";

export const dynamic = "force-dynamic";

const supportedKeys = [
  { name: "openai_api_key", provider: "OpenAI" },
  { name: "anthropic_api_key", provider: "Claude" },
  { name: "compatible_api_key", provider: "OpenAI-uyumlu AI" },
] as const;

export default function KeysRoute() {
  return renderUserPage(() => {
    const ai = getAiSettings();
    const codexAllowed = canUseCodexProvider();
    const codex = codexCapabilityForCurrentContext();
    const date = new Date();
    const monthStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    const initialAi = {
      enabled: isAiEnabled(),
      settings: ai,
      configured: aiConfigured(ai),
      anthropicConfigured: Boolean(secretOrEnv("anthropic_api_key", "ANTHROPIC_API_KEY")),
      apiConfigured: Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
      compatibleConfigured: Boolean(secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY")),
      openrouterConfigured: openRouterConnected(),
      compatibleCapabilityVerified: ai.provider === "compatible" && Boolean(aiModelCapabilities("compatible", ai.model)),
      compatible: getCompatibleSettings(),
      chatgpt: { ...getChatGPTConnectionStatus(), available: process.env.NODE_ENV !== "production" },
      models: { chatgpt: modelOptions("chatgpt"), anthropic: modelOptions("anthropic"), api: modelOptions("api"), compatible: modelOptions("compatible"), codex: codexAllowed ? modelOptions("codex") : [], openrouter: OPENROUTER_MODEL_SUGGESTIONS },
      codex,
      codexAllowed,
      budget: getAiBudgetStatus(),
      usage: getUsageSummary(monthStart),
    };
    const configured = new Map(listSecretMetas().map((secret) => [secret.name, secret]));
    const initialKeys = supportedKeys.map((key) => configured.get(key.name) || { ...key, configured: false, masked: "ayarlı değil", updatedAt: 0 });
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar" title="Modeller ve bağlantılar" description="Kendi AI sağlayıcını bağla, modelini seç ve bağlantıyı doğrula." /><KeysPage initialKeys={initialKeys} initialVaultReady={vaultReady()} initialAi={initialAi} /></div></main>;
  });
}
