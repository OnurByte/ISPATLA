import type { Locale } from "./config";
import type { CampaignLandingCopy } from "./campaign-landing-types";
import { campaignLandingCore } from "./campaign-landing-core";
import { campaignLandingWest } from "./campaign-landing-west";
import { campaignLandingEast } from "./campaign-landing-east";

export const campaignLandingCopy: Record<Locale, CampaignLandingCopy> = {
  ...campaignLandingCore, ...campaignLandingWest, ...campaignLandingEast,
};
export function getCampaignLandingCopy(locale: Locale): CampaignLandingCopy {
  return campaignLandingCopy[locale];
}
