import {
  createOwnHitShare,
  getPublicHitShare,
  listOwnHitShares,
  listOwnShareableXPosts,
  revokeOwnHitShare,
  setOwnHitLeaderboardOptIn,
} from "@/server/db";
import { ensureEvaluationStore } from "@/server/evaluation-store";

function ready(): void {
  ensureEvaluationStore();
}

export function getHitSharingSettings() {
  ready();
  return { posts: listOwnShareableXPosts(), shares: listOwnHitShares() };
}

export function shareOwnXPost(remotePostId: string) {
  ready();
  return createOwnHitShare(remotePostId);
}

export function revokeOwnXPostShare(publicId: string): boolean {
  ready();
  return revokeOwnHitShare(publicId);
}

export function readPublicXPostShare(publicId: string) {
  ready();
  return getPublicHitShare(publicId);
}

export function updateOwnHitLeaderboardParticipation(publicId: string, enabled: boolean): boolean {
  ready();
  return setOwnHitLeaderboardOptIn(publicId, enabled);
}
