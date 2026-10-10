import { KeysPage } from "@/components/keys-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";
import { getPostgresAiBudgetStatus, getPostgresSecretValue, getPostgresSetting, getPostgresUsageSummary, listPostgresSecretMetas, postgresVaultReady } from "@/server/postgres-settings";

export const dynamic = "force-dynamic";

const supportedKeys = [
  { name: "openai_api_key", provider: "OpenAI" },
  { name: "anthropic_api_key", provider: "Claude" },
  { name: "compatible_api_key", provider: "OpenAI-uyumlu AI" },
] as const;

export default function KeysRoute() {
  return renderUserPage(async () => {
    const date = new Date();
    const monthStart = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
    const [storedKeys, provider, model, enabled, dailyBudgetUsd, monthlyBudgetUsd, budget, usage, apiKey, anthropicKey, compatibleKey] = await Promise.all([
      listPostgresSecretMetas(), getPostgresSetting("ai_provider", "api"), getPostgresSetting("ai_model", ""), getPostgresSetting("ai_enabled", "1"),
      getPostgresSetting("ai_daily_budget_usd", "0"), getPostgresSetting("ai_monthly_budget_usd", "0"), getPostgresAiBudgetStatus(), getPostgresUsageSummary(monthStart),
      getPostgresSecretValue("openai_api_key", "OPENAI_API_KEY"), getPostgresSecretValue("anthropic_api_key", "ANTHROPIC_API_KEY"), getPostgresSecretValue("compatible_api_key", "AI_COMPATIBLE_API_KEY"),
    ]);
    const keyMap = new Map(storedKeys.map((secret) => [secret.name, secret]));
    const initialKeys = supportedKeys.map((key) => keyMap.get(key.name) || { ...key, configured: false, masked: "ayarlı değil", updatedAt: 0 });
    const initialAi = {
      enabled: enabled !== "0", settings: { provider: provider as "api" | "compatible" | "codex" | "anthropic" | "chatgpt" | "openrouter", model },
      configured: false, runtimeAvailable: false, apiConfigured: Boolean(apiKey), anthropicConfigured: Boolean(anthropicKey), compatibleConfigured: Boolean(compatibleKey),
      openrouterConfigured: false, compatibleCapabilityVerified: false,
      compatible: { baseUrl: await getPostgresSetting("ai_compatible_base_url", "https://api.openai.com/v1"), name: await getPostgresSetting("ai_compatible_name", "Özel sağlayıcı") },
      chatgpt: { connected: false, available: false, email: null }, models: { chatgpt: [], anthropic: [], api: [], compatible: [], codex: [], openrouter: [] },
      codex: { available: false, authenticated: false, bin: "", version: "", reason: "AI çalışma zamanı PostgreSQL'e taşınıyor" }, codexAllowed: false,
      budget: { ...budget, dailyBudgetUsd: Number(dailyBudgetUsd), monthlyBudgetUsd: Number(monthlyBudgetUsd) },
      usage: { estimatedUsd: usage.estimatedUsd, reportedUsd: usage.reportedUsd, unknownCostEvents: usage.unknownCostEvents, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    };
    return <main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar" title="Modeller ve bağlantılar" description="Kendi AI sağlayıcını bağla, modelini seç ve bağlantıyı doğrula." /><KeysPage initialKeys={initialKeys} initialVaultReady={postgresVaultReady()} initialAi={initialAi} /></div></main>;
  });
}
