// Taslak sağlayıcısını Vercel AI Gateway (OpenAI uyumlu, HTTPS) yapar. Anahtar env'den (AI_COMPATIBLE_API_KEY), DB'ye yazılmaz.
import { setSetting, getSetting } from "../src/server/db";
const now = Math.floor(Date.now() / 1000);
const pairs: Record<string, string> = {
  ai_provider: "compatible",
  ai_model: process.env.ISPATLA_AI_MODEL || "openai/gpt-4.1-mini",
  ai_compatible_base_url: "https://ai-gateway.vercel.sh/v1",
  ai_compatible_name: "Vercel AI Gateway",
  ai_enabled: "1",
};
for (const [k, v] of Object.entries(pairs)) setSetting(k, v, now);
console.log(Object.fromEntries(Object.keys(pairs).map((k) => [k, getSetting(k, "")])));
