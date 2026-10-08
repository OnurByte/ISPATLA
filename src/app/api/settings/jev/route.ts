import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { setSetting } from "@/server/db";
import {
  JEV_MAX_TIMEOUT_MS,
  JEV_MIN_TIMEOUT_MS,
  JEV_MODES,
  JEV_PROVIDERS,
  JEV_RUBRIC_VERSION,
  getJevSettings,
  jevConfigured,
  jevEndpoint,
} from "@/server/jev";
import { isAllowedJevEndpoint } from "@/server/security";
import { saveSecret, secretOrEnv, vaultReady } from "@/server/vault";

export const runtime = "nodejs";

function payload() {
  const settings = getJevSettings();
  return {
    settings,
    endpoint: jevEndpoint(settings.baseUrl),
    rubricVersion: JEV_RUBRIC_VERSION,
    keyConfigured: Boolean(secretOrEnv("jev_api_key", "JEV_API_KEY")),
    configured: jevConfigured(settings),
    vaultReady: vaultReady(),
    modes: JEV_MODES,
    providers: JEV_PROVIDERS,
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
  const now = Math.floor(Date.now() / 1000);
  try {
    if ("mode" in body) {
      const mode = String(body.mode);
      if (!(JEV_MODES as readonly string[]).includes(mode)) throw new Error("Jev modu off, shadow veya on olmalı");
      setSetting("jev_mode", mode, now);
    }
    if ("provider" in body) {
      const provider = String(body.provider);
      if (!(JEV_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Jev sağlayıcısı typesafe veya vercel olmalı");
      setSetting("jev_provider", provider, now);
    }
    if ("model" in body) {
      const model = String(body.model).trim();
      if (!model || model.length > 128) throw new Error("Jev modeli geçersiz");
      setSetting("jev_model", model, now);
    }
    if ("baseUrl" in body) {
      const baseUrl = String(body.baseUrl).trim();
      if (!isAllowedJevEndpoint(jevEndpoint(baseUrl))) throw new Error("Jev adresi https olmalı ve sorgu/kimlik içermemeli");
      setSetting("jev_base_url", baseUrl, now);
    }
    if ("timeoutMs" in body) {
      const timeout = Number(body.timeoutMs);
      if (!Number.isFinite(timeout) || timeout < JEV_MIN_TIMEOUT_MS || timeout > JEV_MAX_TIMEOUT_MS) {
        throw new Error(`Jev zaman aşımı ${JEV_MIN_TIMEOUT_MS}-${JEV_MAX_TIMEOUT_MS} ms aralığında olmalı`);
      }
      setSetting("jev_timeout_ms", String(Math.round(timeout)), now);
    }
    if ("cacheTtlSeconds" in body) {
      const ttl = Number(body.cacheTtlSeconds);
      if (!Number.isFinite(ttl) || ttl < 0 || ttl > 86_400) throw new Error("Jev önbellek süresi 0-86400 saniye olmalı");
      setSetting("jev_cache_ttl_seconds", String(Math.round(ttl)), now);
    }
    if ("apiKey" in body) {
      const value = String(body.apiKey).trim();
      if (!value) throw new Error("Jev API anahtarı boş olamaz");
      saveSecret("jev_api_key", "Jev", value, now);
    }
    return NextResponse.json(payload());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jev ayarı kaydedilemedi" }, { status: 400 });
  }
}

export const GET = withUser(GETHandler);

export const PUT = withUser(PUTHandler);
