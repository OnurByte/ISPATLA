import { AppShell } from "@/components/app-shell";
import { KeysPage } from "@/components/keys-page";
import { PageHeading } from "@/components/page-heading";
import { aiModelCapabilities, canUseCodexProvider, codexCapabilityForCurrentContext, getAiSettings, getCompatibleSettings, isAiEnabled, modelOptions } from "@/server/ai";
import { getAiBudgetStatus, getUsageSummary } from "@/server/db";
import { listSecretMetas, secretOrEnv, vaultReady } from "@/server/vault";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

const supportedKeys = new Set(["openai_api_key", "compatible_api_key", "jev_api_key"]);

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
      configured: ai.provider === "codex" ? codex.authenticated : ai.provider === "compatible" ? Boolean(ai.model && getCompatibleSettings().baseUrl && secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY") && aiModelCapabilities("compatible", ai.model)) : Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
      apiConfigured: Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
      compatibleConfigured: Boolean(secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY")),
      compatibleCapabilityVerified: ai.provider === "compatible" && Boolean(aiModelCapabilities("compatible", ai.model)),
      compatible: getCompatibleSettings(),
      models: { api: modelOptions("api"), compatible: modelOptions("compatible"), codex: codexAllowed ? modelOptions("codex") : [] },
      codex,
      codexAllowed,
      budget: getAiBudgetStatus(),
      usage: getUsageSummary(monthStart),
    };
    return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / secrets" title="Key yönetimi" description="AI sağlayıcı anahtarlarını sunucu tarafındaki kasada maskeli yönetin." /><KeysPage initialKeys={listSecretMetas().filter((secret) => supportedKeys.has(secret.name))} initialVaultReady={vaultReady()} initialAi={initialAi} /></div></main></AppShell>;
  });
}
