import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getPostgresSecretValue, getPostgresSetting, postgresVaultReady, savePostgresSecret, encryptPostgresSecret, setPostgresSetting } from "@/server/postgres-settings";
import { isAllowedJevEndpoint } from "@/server/security";

export const runtime = "nodejs";
const MODES = ["off", "shadow", "on"] as const;
const PROVIDERS = ["typesafe", "vercel", "openrouter"] as const;
const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-1.13.0";
const OPENROUTER_MODEL = "typesafe/jev-1.13";
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 10_000;

async function settings() {
  const [storedProvider, storedModel, baseUrl, timeout, ttl] = await Promise.all([
    getPostgresSetting("jev_provider", "typesafe"),
    getPostgresSetting("jev_model", ""), getPostgresSetting("jev_base_url", DEFAULT_BASE_URL),
    getPostgresSetting("jev_timeout_ms", "3000"), getPostgresSetting("jev_cache_ttl_seconds", ""),
  ]);
  const provider = (PROVIDERS as readonly string[]).includes(storedProvider) ? storedProvider : "typesafe";
  const model = storedModel.trim() || (provider === "openrouter" ? OPENROUTER_MODEL : DEFAULT_MODEL);
  const timeoutValue = Number(timeout), ttlValue = Number(ttl);
  const keyConfigured = provider === "openrouter"
    ? Boolean(await getPostgresSecretValue("openrouter_api_key", "OPENROUTER_API_KEY"))
    : Boolean(await getPostgresSecretValue("jev_api_key", "JEV_API_KEY"));
  const mode = "off" as const;
  const base = baseUrl.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  return { settings: { mode, model, provider, baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
    timeoutMs: Number.isFinite(timeoutValue) ? Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.round(timeoutValue))) : 3000,
    cacheTtlSeconds: Number.isFinite(ttlValue) && ttl !== "" ? Math.max(0, Math.min(86400, Math.round(ttlValue))) : 3600 },
    endpoint: base.endsWith("/v1") ? `${base}/systemone` : `${base}/v1/systemone`, rubricVersion: "relevance-v1", keyConfigured,
    configured: false, runtimeAvailable: false, vaultReady: postgresVaultReady(), modes: MODES, providers: PROVIDERS };
}
async function GETHandler() { return NextResponse.json(await settings(), { headers: { "Cache-Control": "no-store" } }); }

async function PUTHandler(request: Request) {
  const denied = guardMutation(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); } catch { return NextResponse.json({ error: "geçersiz JSON gövdesi" }, { status: 400 }); }
  const now = Math.floor(Date.now() / 1000);
  try {
    if ("mode" in body) {
      if (!(MODES as readonly unknown[]).includes(body.mode)) throw new Error("Jev modu off, shadow veya on olmalı");
      if (body.mode !== "off") throw new Error("Jev çalışma zamanı PostgreSQL'e taşınıncaya kadar kapalı tutulmalı");
      await setPostgresSetting("jev_mode", "off", now);
    }
    if ("provider" in body) {
      const provider = String(body.provider);
      if (!(PROVIDERS as readonly string[]).includes(provider)) throw new Error("Jev sağlayıcısı desteklenmiyor");
      await setPostgresSetting("jev_provider", provider, now);
      if (provider === "openrouter" && !("model" in body)) await setPostgresSetting("jev_model", OPENROUTER_MODEL, now);
    }
    if ("model" in body) {
      const model = String(body.model).trim();
      if (!model || model.length > 128) throw new Error("Jev modeli geçersiz");
      await setPostgresSetting("jev_model", model, now);
    }
    if ("baseUrl" in body) {
      const baseUrl = String(body.baseUrl).trim();
      const endpoint = baseUrl.replace(/\/$/, "").endsWith("/v1") ? `${baseUrl.replace(/\/$/, "")}/systemone` : `${baseUrl.replace(/\/$/, "")}/v1/systemone`;
      if (!isAllowedJevEndpoint(endpoint)) throw new Error("Jev adresi https olmalı ve sorgu/kimlik içermemeli");
      await setPostgresSetting("jev_base_url", baseUrl, now);
    }
    if ("timeoutMs" in body) {
      const value = Number(body.timeoutMs);
      if (!Number.isFinite(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) throw new Error(`Jev zaman aşımı ${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS} ms aralığında olmalı`);
      await setPostgresSetting("jev_timeout_ms", String(Math.round(value)), now);
    }
    if ("cacheTtlSeconds" in body) {
      const value = Number(body.cacheTtlSeconds);
      if (!Number.isFinite(value) || value < 0 || value > 86_400) throw new Error("Jev önbellek süresi 0-86400 saniye olmalı");
      await setPostgresSetting("jev_cache_ttl_seconds", String(Math.round(value)), now);
    }
    if ("apiKey" in body) {
      const provider = await getPostgresSetting("jev_provider", "typesafe");
      if (provider === "openrouter") throw new Error("OpenRouter anahtarı bu hesap bağlantısından yönetilir");
      const value = String(body.apiKey).trim();
      if (!value) throw new Error("Jev API anahtarı boş olamaz");
      await savePostgresSecret("jev_api_key", "Jev", encryptPostgresSecret(value), now);
    }
    return NextResponse.json(await settings());
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Jev ayarı kaydedilemedi" }, { status: 400 }); }
}

export const GET = withUser(GETHandler);
export const PUT = withUser(PUTHandler);
