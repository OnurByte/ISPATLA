import { currentOwnerId } from "./owner-context";
import { getAccounts, getOwnUserProfile, syncUserProfileFromX, type OwnUserProfile } from "./db";
import { OfficialXClient } from "./official-x";
import { getXAccountAuthState } from "./x-oauth-store";
import { withOfficialAccount } from "./publisher";
import { cacheSelectedProfileAvatar } from "./profile-avatar";

export async function loadOwnUserProfileFromX(): Promise<OwnUserProfile> {
  const profile = getOwnUserProfile();
  if (profile.xHandle) return profile;
  const ownerUserId = currentOwnerId();
  if (!ownerUserId) return profile;
  const client = new OfficialXClient();
  const accounts = getAccounts().filter((account) => account.ownerUserId === ownerUserId && account.enabled)
    .sort((a, b) => Number(b.defaultAccount) - Number(a.defaultAccount));

  for (const account of accounts) {
    if (!getXAccountAuthState(account.id, ownerUserId)?.connected) continue;
    try {
      return await withOfficialAccount(account, async (credential) => {
        const remote = await client.getOwnProfile(credential);
        if (remote.id !== credential.xUserId || typeof remote.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(remote.username)) return profile;
        const handle = remote.username.replace(/^@/, "");
        const displayName = typeof remote.name === "string" ? remote.name : handle;
        const bio = typeof remote.description === "string" ? remote.description : "";
        syncUserProfileFromX({ ownerUserId, xUserId: credential.xUserId, handle, displayName, bio, avatarUrl: null });
        if (typeof remote.profile_image_url === "string") {
          try { await cacheSelectedProfileAvatar({ ownerUserId, xUserId: credential.xUserId, handle, displayName, bio, avatarUrl: remote.profile_image_url }); }
          catch { /* Avatar availability does not affect the profile import. */ }
        }
        return getOwnUserProfile();
      });
    } catch { return profile; }
  }
  return profile;
}
