/**
 * Official X data and publishing stay unavailable until the product has a
 * real Prime entitlement and budget check. Deployment configuration alone
 * cannot make paid operations available.
 */
export function isOfficialXCallsAvailable(): boolean {
  return false;
}

export function assertOfficialXCallsAvailable(): void {
  if (!isOfficialXCallsAvailable()) {
    throw new Error("Official 𝕏 API data and publishing are unavailable until Prime entitlements and budget enforcement are implemented.");
  }
}

/** Distinguish granted X scopes from operations İSPATLA currently permits. */
export function describeOfficialXCapabilities(scopes: readonly string[]) {
  const providerCapabilities = {
    post: scopes.includes("tweet.write"),
    repost: scopes.includes("tweet.write"),
    reply: scopes.includes("tweet.write"),
    media: scopes.includes("media.write"),
    quote: "unknown" as const,
  };
  const available = isOfficialXCallsAvailable();
  return {
    apiEnabled: available,
    unavailableReason: available ? null : "prime_unavailable" as const,
    providerCapabilities,
    capabilities: {
      post: available && providerCapabilities.post,
      repost: available && providerCapabilities.repost,
      reply: available && providerCapabilities.reply,
      media: available && providerCapabilities.media,
      quote: available ? "unknown" as const : "disabled" as const,
    },
  };
}
