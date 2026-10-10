import { sql } from "drizzle-orm";
import { currentOwnerId } from "./owner-context";
import { getPostgresDb } from "./postgres";
import { getPostgresOwnUserProfile } from "./postgres-profile-dashboard";
import { getPostgresAccounts } from "./postgres-accounts";
import { OfficialXClient } from "./official-x";
import { getPostgresXAccountAuthState, getPostgresOwnUserProfileXUserId } from "./postgres-x-oauth";
import { withOfficialAccount } from "./publisher";

export type SyncedOwnUserProfile = {
  username: string; displayName: string; bio: string; visibility: "private" | "public"; createdAt: number; updatedAt: number;
  xHandle: string | null; avatarUrl: string | null; onboardingCompleted: boolean; profilePath: string;
};

export async function loadOwnUserProfileFromX(): Promise<SyncedOwnUserProfile> {
  const ownerUserId = currentOwnerId();
  const profile = await getPostgresOwnUserProfile();
  if (!ownerUserId) return profile;
  const boundXUserId = await getPostgresOwnUserProfileXUserId(ownerUserId);
  const client = new OfficialXClient();
  const accounts = (await getPostgresAccounts(ownerUserId)).filter((account) => account.enabled);

  for (const account of accounts) {
    const authState = await getPostgresXAccountAuthState(account.id, ownerUserId);
    if (!authState?.connected || (boundXUserId && authState.xUserId !== boundXUserId)) continue;
    try {
      return await withOfficialAccount(account, async (credential) => {
        const remote = await client.getOwnProfile(credential);
        if (remote.id !== credential.xUserId || typeof remote.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(remote.username)) return profile;
        const handle = remote.username.replace(/^@/, "");
        const displayName = typeof remote.name === "string" ? remote.name : handle;
        const bio = typeof remote.description === "string" ? remote.description : "";
        const protectedAccount = typeof remote.protected === "boolean" ? remote.protected : null;
        await getPostgresDb().execute(sql`UPDATE ispatla_app.user_profiles
          SET x_handle=${handle},display_name=${displayName.slice(0,80)},bio=${bio.slice(0,500)},
          visibility=CASE WHEN ${protectedAccount}::boolean IS NULL THEN visibility WHEN ${protectedAccount} THEN 'private' ELSE 'public' END,
          updated_at=${Math.floor(Date.now()/1000)} WHERE owner_user_id=${ownerUserId}`);
        return getPostgresOwnUserProfile();
      });
    } catch { return profile; }
  }
  return profile;
}
