// Onboarding gate.
//
// Single source of truth for "is this install configured yet", used by the
// dashboard redirect, the onboarding page itself and the status endpoint. Three
// call sites reading the same expression is how they drift apart.

import { getAccounts } from "./db";
import { automationEnabled } from "./pipeline";
import { aiConfigured, getAiSettings, isAiEnabled } from "./ai";
import { secretOrEnv } from "./vault";
import { xApiConfigStatus } from "./x-api";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  required: boolean;
  detail?: string;
};

export function onboardingSteps(): OnboardingStep[] {
  const xApi = xApiConfigStatus();
  const ai = getAiSettings();
  return [
    {
      id: "account",
      title: "X hesabı",
      description: "Panelin hangi hesapla çalışacağını bilmesi gerekiyor.",
      done: getAccounts().length > 0,
      required: true,
    },
    {
      id: "x-api",
      title: "X API bağlantısı",
      description: "API key, token ya da OAuth ile bağlan.",
      done: xApi.canRead,
      required: true,
      detail: xApi.configured
        ? xApi.canPublish
          ? "OAuth bağlı — yayınlama açık"
          : "Bearer bağlı — sadece okuma"
        : `Eksik: ${xApi.missing.join(", ")}`,
    },
    {
      id: "ai",
      title: "AI sağlayıcısı",
      description: "Fırsat skorlaması ve taslak üretimi için.",
      done: isAiEnabled() && aiConfigured(ai),
      required: false,
      detail:
        secretOrEnv("compatible_api_key", "AI_COMPATIBLE_API_KEY") || secretOrEnv("openai_api_key", "OPENAI_API_KEY")
          ? "Anahtar var"
          : "Anahtar yok",
    },
    {
      id: "automation",
      title: "Otomasyon",
      description: "Kaynak taraması ve kuyruğun arka planda çalışması.",
      done: automationEnabled(),
      required: false,
    },
  ];
}

/**
 * True while any required step is still open. Optional steps never block: a
 * deploy that only reads is a working deploy.
 */
export function needsOnboarding(): boolean {
  return onboardingSteps().some((step) => step.required && !step.done);
}