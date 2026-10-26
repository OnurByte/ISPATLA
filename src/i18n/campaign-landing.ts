import type { Locale } from "./config";
import type { CampaignLandingCopy } from "./campaign-landing-types";
import { campaignLandingCore } from "./campaign-landing-core";
import { campaignLandingWest } from "./campaign-landing-west";
import { campaignLandingEast } from "./campaign-landing-east";
import { campaignLandingDemo } from "./campaign-landing-demo";

export const campaignLandingCopy: Record<Locale, Omit<CampaignLandingCopy, "demo">> = {
  ...campaignLandingCore, ...campaignLandingWest, ...campaignLandingEast,
};
export function getCampaignLandingCopy(locale: Locale): CampaignLandingCopy {
  return { ...campaignLandingCopy[locale], demo: campaignLandingDemo[locale] };
}
