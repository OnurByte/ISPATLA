import { readFile, stat } from "node:fs/promises";
import type { Account } from "./db";
import { OfficialXClient, OfficialXError, type OfficialXCredentials, type OfficialXPostReceipt } from "./official-x";
import { getXAccountAuthState, type XCredential } from "./x-oauth-store";
import { refreshXToken } from "./x-oauth";
import { currentOwnerId, runAsOwner } from "./owner-context";

export type PublishInput = {
  account: Account;
  credentials: OfficialXCredentials;
  text: string;
  mediaPath?: string;
};
export type PublishReceipt = OfficialXPostReceipt & { ok: true; transport: "official_x" };
export type PublisherCapabilities = { post: boolean; repost: boolean; reply: boolean; media: boolean; quote: "unknown" };

export class OfficialXPublisher {
  constructor(readonly client: OfficialXClient = new OfficialXClient()) {}

  health(account: Account): { ok: boolean; reason: string } {
    if (!account.ownerUserId) return { ok: false, reason: "X account owner is not bound" };
    const state = getXAccountAuthState(account.id, account.ownerUserId);
    if (!state?.connected) return { ok: false, reason: "X account requires connection or reauthorization" };
    return { ok: true, reason: "" };
  }

  capabilities(scopes: readonly string[] = []): PublisherCapabilities {
    const write = scopes.includes("tweet.write");
    return {
      post: write,
      repost: write,
      reply: write && scopes.includes("tweet.read"),
      media: scopes.includes("media.write"),
      quote: "unknown",
    };
  }

  async publishPost(input: PublishInput): Promise<PublishReceipt> {
    if (input.credentials.xUserId.length === 0) throw new Error("authenticated X identity is required");
    let mediaIds: string[] | undefined;
    if (input.mediaPath) {
      const lower = input.mediaPath.toLowerCase();
      const mediaType = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg"
        : lower.endsWith(".png") ? "image/png" : lower.endsWith(".gif") ? "image/gif"
          : lower.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
      const maximumBytes = mediaType === "image/jpeg" || mediaType === "image/png" ? 5 * 1024 * 1024
        : mediaType === "image/gif" ? 15 * 1024 * 1024 : mediaType === "video/mp4" ? 512 * 1024 * 1024 : 0;
      let metadata;
      try { metadata = await stat(input.mediaPath); } catch {
        throw new OfficialXError({ code: "invalid_media", message: "Media file is unavailable; publication was not sent.", safeToRetry: false, remoteStateKnown: true });
      }
      if (!maximumBytes || metadata.size < 1 || metadata.size > maximumBytes) {
        throw new OfficialXError({ code: "invalid_media", message: "Media type is unsupported or its file exceeds the configured size limit.", safeToRetry: false, remoteStateKnown: true });
      }
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await readFile(input.mediaPath)); } catch {
        throw new OfficialXError({ code: "invalid_media", message: "Media file is unreadable; publication was not sent.", safeToRetry: false, remoteStateKnown: true });
      }
      const upload = await this.client.uploadMedia(input.credentials, { bytes, mediaType });
      const ready = upload.processingState === "succeeded" ? upload : await this.client.pollMediaStatus(input.credentials, upload.mediaId, 3);
      if (ready.processingState !== "succeeded") {
        throw new OfficialXError({ code: "invalid_media", message: "Media processing did not succeed; publication was not sent.", safeToRetry: false, remoteStateKnown: true });
      }
      mediaIds = [ready.mediaId];
    }
    const receipt = await this.client.createPost(input.credentials, { text: input.text, ...(mediaIds ? { mediaIds } : {}) });
    return { ...receipt, ok: true, transport: "official_x" };
  }
}

const publisher = new OfficialXPublisher();

/** Resolve the X identity only from the account's persisted OAuth binding. */
export async function withOfficialAccount<T>(account: Account, work: (credential: XCredential) => Promise<T>): Promise<T> {
  const ownerUserId = account.ownerUserId;
  if (!ownerUserId) throw new Error("X account has no authenticated owner binding");
  const callerOwner = currentOwnerId();
  if (callerOwner && callerOwner !== ownerUserId) throw new Error("X account is outside the authenticated owner context");
  return runAsOwner(ownerUserId, async () => {
    const state = getXAccountAuthState(account.id, ownerUserId);
    if (!state?.connected) throw new Error("X account requires reauthorization");
    return refreshXToken<T>({ accountId: account.id, ownerUserId }, work);
  });
}

export function publish(input: PublishInput, selectedPublisher: OfficialXPublisher = publisher): Promise<PublishReceipt> {
  return selectedPublisher.publishPost(input);
}

export function publisherHealth(account: Account): ReturnType<OfficialXPublisher["health"]> {
  return publisher.health(account);
}
