import { AppShell } from "@/components/app-shell";
import { XApiCard } from "@/components/x-api-card";
import { KeysPage } from "@/components/keys-page";
import { PageHeading } from "@/components/page-heading";
import { detectCodex, getAiSettings, getCompatibleSettings, isAiEnabled, modelOptions } from "@/server/ai";
import { listSecretMetas, secretOrEnv, vaultReady } from "@/server/vault";
import { xApiConfigStatus } from "@/server/x-api";

export const dynamic = "force-dynamic";

export default function KeysRoute() {
  const ai = getAiSettings();
  const codex = detectCodex();
  const initialAi = {
    enabled: isAiEnabled(),
    settings: ai,
    configured: ai.provider === "codex" ? codex.authenticated : ai.provider === "compatible" ? Boolean(ai.model && getCompatibleSettings().baseUrl && secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY")) : Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
    apiConfigured: Boolean(secretOrEnv("openai_api_key", "OPENAI_API_KEY")),
    compatibleConfigured: Boolean(secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY")),
    compatible: getCompatibleSettings(),
    models: { api: modelOptions("api"), compatible: modelOptions("compatible"), codex: modelOptions("codex") },
    codex,
  };
  return <AppShell><main className="min-h-screen"><div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"><PageHeading eyebrow="Ayarlar / secrets" title="Key edit" description="OpenAI, OpenAI-uyumlu API, Codex ve x-use entegrasyonlarını sunucu tarafında maskeli yönet." /><KeysPage initialKeys={listSecretMetas()} initialVaultReady={vaultReady()} initialAi={initialAi} /><XApiCard initialStatus={xApiConfigStatus()} /></div></main></AppShell>;
}
