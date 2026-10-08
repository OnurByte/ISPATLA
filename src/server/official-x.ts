/** Minimal X API v2 write client. Credentials are supplied per call and never retained. */
export type OfficialXErrorCode =
  | "reauth" | "capability" | "rate_limited" | "known_retryable"
  | "unknown_remote_state" | "remote_validation" | "invalid_media"
  | "policy_blocked" | "remote_unavailable";

export class OfficialXError extends Error {
  readonly safeToRetry: boolean;
  readonly remoteStateKnown: boolean;
  readonly retryAfter?: string;
  readonly rateLimitReset?: number;
  constructor(input: {
    code: OfficialXErrorCode; message: string; safeToRetry: boolean; remoteStateKnown: boolean;
    retryAfter?: string; rateLimitReset?: number;
  }) {
    super(input.message);
    this.name = "OfficialXError";
    this.code = input.code;
    this.safeToRetry = input.safeToRetry;
    this.remoteStateKnown = input.remoteStateKnown;
    this.retryAfter = input.retryAfter;
    this.rateLimitReset = input.rateLimitReset;
  }
  readonly code: OfficialXErrorCode;
}

export interface OfficialXCredentials { accessToken: string; xUserId: string }
export interface OfficialXCapabilities {
  /** Unknown unless an entitlement was verified outside this client. */
  quote: "unknown" | "enabled" | "disabled";
}
export interface OfficialXPostReceipt { id: string; text: string }
export interface OfficialXRepostLookup { userIds: string[]; complete: boolean }
export interface OfficialXMediaReceipt {
  mediaId: string;
  mediaKey?: string;
  processingState: "pending" | "in_progress" | "succeeded" | "failed" | "unknown";
  checkAfterSeconds?: number;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const API = "https://api.x.com/2";
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const MEDIA_LIMITS: Record<string, { maxBytes: number; category: string }> = {
  "image/jpeg": { maxBytes: 5 * 1024 * 1024, category: "tweet_image" },
  "image/png": { maxBytes: 5 * 1024 * 1024, category: "tweet_image" },
  "image/gif": { maxBytes: 15 * 1024 * 1024, category: "tweet_gif" },
  // Conservative application bound despite X allowing larger uploads by account tier.
  "video/mp4": { maxBytes: 512 * 1024 * 1024, category: "tweet_video" },
};

function credentialsValid(credentials: OfficialXCredentials) {
  if (!credentials.accessToken.trim() || !/^\d{1,19}$/.test(credentials.xUserId)) {
    throw new OfficialXError({ code: "reauth", message: "Connect the X account again.", safeToRetry: false, remoteStateKnown: true });
  }
}

function endpointId(value: string, label: string): string {
  if (!/^\d{1,32}$/.test(value)) throw new OfficialXError({ code: "remote_validation", message: `Invalid ${label}.`, safeToRetry: false, remoteStateKnown: true });
  return value;
}

function remoteError(response: Response, write: boolean): OfficialXError {
  const status = response.status;
  const reset = Number(response.headers.get("x-rate-limit-reset"));
  const retryAfter = response.headers.get("retry-after") || undefined;
  const common = { retryAfter, ...(Number.isFinite(reset) && reset > 0 ? { rateLimitReset: reset } : {}) };
  if (status === 401) return new OfficialXError({ ...common, code: "reauth", message: "Reconnect the X account to continue.", safeToRetry: false, remoteStateKnown: true });
  if (status === 403) return new OfficialXError({ ...common, code: "capability", message: "This X account or API plan cannot perform this action.", safeToRetry: false, remoteStateKnown: true });
  if (status === 429) return new OfficialXError({ ...common, code: "rate_limited", message: "X rate limit reached. Wait until the supplied reset time before another action.", safeToRetry: false, remoteStateKnown: true });
  if (status >= 500) return new OfficialXError({ ...common,
    code: write ? "unknown_remote_state" : "known_retryable",
    message: write ? "X may have processed this write. Reconcile before any retry." : "X is temporarily unavailable.",
    safeToRetry: !write, remoteStateKnown: !write,
  });
  return new OfficialXError({ ...common, code: "remote_validation", message: "X rejected the request. Review the account, content, and media requirements.", safeToRetry: false, remoteStateKnown: true });
}

export class OfficialXClient {
  constructor(private readonly fetcher: Fetcher = fetch as Fetcher) {}

  private async request(credentials: OfficialXCredentials, path: string, init: RequestInit, write: boolean): Promise<Response> {
    if(process.env.ISPATLA_DEMO === "1") throw new Error("Official X requests are disabled in demo mode");
    credentialsValid(credentials);
    try {
      const response = await this.fetcher(`${API}${path}`, {
        ...init,
        redirect: "error",
        signal: init.signal || AbortSignal.timeout(15_000),
        headers: new Headers({ accept: "application/json", authorization: `Bearer ${credentials.accessToken}`, ...Object.fromEntries(new Headers(init.headers)) }),
      });
      if (!response.ok) throw remoteError(response, write);
      return response;
    } catch (error) {
      if (error instanceof OfficialXError) throw error;
      // A lost response to any write leaves the remote outcome ambiguous. Never retry here.
      throw new OfficialXError({
        code: write ? "unknown_remote_state" : "remote_unavailable",
        message: write ? "The connection ended before X confirmed the write. Reconcile before any retry." : "Could not reach X. Try again later.",
        safeToRetry: false,
        remoteStateKnown: !write,
      });
    }
  }

  private async json(credentials: OfficialXCredentials, path: string, payload?: unknown): Promise<Record<string, unknown>> {
    const write = payload !== undefined;
    const response = await this.request(credentials, path, {
      method: payload === undefined ? "GET" : "POST",
      ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    }, write);
    try {
      return await response.json() as Record<string, unknown>;
    } catch {
      throw new OfficialXError({
        code: write ? "unknown_remote_state" : "remote_unavailable",
        message: write ? "X accepted a response connection but did not return a usable receipt. Reconcile before any retry." : "X returned an unreadable response.",
        safeToRetry: false,
        remoteStateKnown: !write,
      });
    }
  }

  async createPost(credentials: OfficialXCredentials, input: { text: string; mediaIds?: string[] }): Promise<OfficialXPostReceipt> {
    if (!input.text.trim() || input.text.length > 280 || (input.mediaIds?.length || 0) > 4) {
      throw new OfficialXError({ code: "remote_validation", message: "Post text or attachment count is invalid.", safeToRetry: false, remoteStateKnown: true });
    }
    const body: Record<string, unknown> = { text: input.text };
    if (input.mediaIds?.length) body.media = { media_ids: input.mediaIds.map((id) => endpointId(id, "media ID")) };
    return this.postReceipt(await this.json(credentials, "/tweets", body));
  }

  async reply(credentials: OfficialXCredentials, input: {
    text: string; postId: string; summonedBy: "author_mention" | "author_quoted" | "manual_approval" | "unknown";
  }): Promise<OfficialXPostReceipt> {
    if (input.summonedBy !== "author_mention" && input.summonedBy !== "author_quoted") {
      throw new OfficialXError({ code: "policy_blocked", message: "X self-serve replies require the original author to summon this account by mention or quote. Manual approval does not satisfy this requirement.", safeToRetry: false, remoteStateKnown: true });
    }
    if (!input.text.trim() || input.text.length > 280) throw new OfficialXError({ code: "remote_validation", message: "Reply text is invalid.", safeToRetry: false, remoteStateKnown: true });
    return this.postReceipt(await this.json(credentials, "/tweets", { text: input.text, reply: { in_reply_to_tweet_id: endpointId(input.postId, "post ID") } }));
  }

  async quote(credentials: OfficialXCredentials, input: { text: string; postId: string }, capabilities: OfficialXCapabilities = { quote: "unknown" }): Promise<OfficialXPostReceipt> {
    if (capabilities.quote !== "enabled") throw new OfficialXError({ code: "capability", message: "Quote posts require a verified X Enterprise entitlement.", safeToRetry: false, remoteStateKnown: true });
    if (!input.text.trim() || input.text.length > 280) throw new OfficialXError({ code: "remote_validation", message: "Quote text is invalid.", safeToRetry: false, remoteStateKnown: true });
    return this.postReceipt(await this.json(credentials, "/tweets", { text: input.text, quote_tweet_id: endpointId(input.postId, "post ID") }));
  }

  async repost(credentials: OfficialXCredentials, postId: string): Promise<{ reposted: boolean }> {
    const result = await this.json(credentials, `/users/${endpointId(credentials.xUserId, "X user ID")}/retweets`, { tweet_id: endpointId(postId, "post ID") });
    const data = result.data as Record<string, unknown> | undefined;
    if (typeof data?.retweeted !== "boolean") throw new OfficialXError({ code: "unknown_remote_state", message: "X returned no usable repost receipt. Reconcile before any retry.", safeToRetry: false, remoteStateKnown: false });
    return { reposted: data.retweeted };
  }

  async uploadMedia(credentials: OfficialXCredentials, input: { bytes: Uint8Array; mediaType: string }): Promise<OfficialXMediaReceipt> {
    const media = MEDIA_LIMITS[input.mediaType];
    if (!media || input.bytes.byteLength === 0 || input.bytes.byteLength > media.maxBytes) {
      throw new OfficialXError({ code: "invalid_media", message: "Media type is unsupported or its file exceeds the configured size limit.", safeToRetry: false, remoteStateKnown: true });
    }
    const initialized = await this.json(credentials, "/media/upload/initialize", {
      media_category: media.category, media_type: input.mediaType, total_bytes: input.bytes.byteLength,
    });
    const initData = initialized.data as Record<string, unknown> | undefined;
    const mediaId = typeof initData?.id === "string" ? initData.id : "";
    if (!/^\d{1,32}$/.test(mediaId)) throw new OfficialXError({ code: "unknown_remote_state", message: "X returned no usable media upload ID. Reconcile before any retry.", safeToRetry: false, remoteStateKnown: false });

    for (let offset = 0, segment = 0; offset < input.bytes.byteLength; offset += UPLOAD_CHUNK_BYTES, segment++) {
      const form = new FormData();
      form.set("segment_index", String(segment));
      const chunk = input.bytes.slice(offset, Math.min(offset + UPLOAD_CHUNK_BYTES, input.bytes.byteLength));
      form.set("media", new Blob([chunk], { type: input.mediaType }), "upload");
      await this.request(credentials, `/media/upload/${encodeURIComponent(mediaId)}/append`, { method: "POST", body: form }, true);
    }
    const finalized = await this.json(credentials, `/media/upload/${encodeURIComponent(mediaId)}/finalize`, {});
    const data = finalized.data as Record<string, unknown> | undefined;
    const processing = data?.processing_info as Record<string, unknown> | undefined;
    const processingState = this.processingState(processing?.state, input.mediaType === "image/jpeg" || input.mediaType === "image/png");
    return {
      mediaId,
      ...(typeof data?.media_key === "string" ? { mediaKey: data.media_key } : {}),
      processingState,
      ...(typeof processing?.check_after_secs === "number" ? { checkAfterSeconds: processing.check_after_secs } : {}),
    };
  }

  async getMediaStatus(credentials: OfficialXCredentials, mediaId: string): Promise<OfficialXMediaReceipt> {
    const id = endpointId(mediaId, "media ID");
    const result = await this.json(credentials, `/media/upload?media_id=${encodeURIComponent(id)}`);
    const data = result.data as Record<string, unknown> | undefined;
    const processing = data?.processing_info as Record<string, unknown> | undefined;
    if (!data || typeof data.id !== "string") throw new OfficialXError({ code: "remote_validation", message: "X returned an invalid media status.", safeToRetry: false, remoteStateKnown: true });
    return {
      mediaId: data.id,
      ...(typeof data.media_key === "string" ? { mediaKey: data.media_key } : {}),
      processingState: this.processingState(processing?.state, false),
      ...(typeof processing?.check_after_secs === "number" ? { checkAfterSeconds: processing.check_after_secs } : {}),
    };
  }

  /** Poll only a bounded number of times; callers can persist pending state for later reconciliation. */
  async pollMediaStatus(credentials: OfficialXCredentials, mediaId: string, maxPolls = 3): Promise<OfficialXMediaReceipt> {
    const polls = Math.max(1, Math.min(5, Math.floor(maxPolls)));
    let result: OfficialXMediaReceipt | undefined;
    for (let attempt = 0; attempt < polls; attempt++) {
      result = await this.getMediaStatus(credentials, mediaId);
      if (result.processingState !== "pending" && result.processingState !== "in_progress") return result;
      if (attempt + 1 < polls) {
        const delay = Math.max(0, Math.min(2, result.checkAfterSeconds ?? 1));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }
    }
    return result!;
  }

  async getPost(credentials: OfficialXCredentials, postId: string): Promise<Record<string, unknown> | null> {
    const result = await this.json(credentials, `/tweets/${endpointId(postId, "post ID")}?tweet.fields=created_at,author_id,conversation_id,referenced_tweets,entities,public_metrics`);
    return result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : null;
  }

  async getOwnTimeline(credentials: OfficialXCredentials, maxResults = 100): Promise<Array<Record<string, unknown>>> {
    const count = Math.max(5, Math.min(100, Math.floor(maxResults)));
    const result = await this.json(credentials, `/users/${endpointId(credentials.xUserId, "X user ID")}/tweets?max_results=${count}&tweet.fields=author_id,created_at,conversation_id,referenced_tweets`);
    return Array.isArray(result.data) ? result.data.filter((post): post is Record<string, unknown> => Boolean(post) && typeof post === "object") : [];
  }

  async getOwnProfile(credentials: OfficialXCredentials): Promise<Record<string, unknown>> {
    const result = await this.json(credentials, "/users/me?user.fields=description,name,username,public_metrics");
    return result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  }

  /** Read bounded pages of the official reposted_by endpoint; only a returned user ID is positive evidence. */
  async getRepostedBy(credentials: OfficialXCredentials, postId: string, maxPages = 3): Promise<OfficialXRepostLookup> {
    const id = endpointId(postId, "post ID");
    const pages = Math.max(1, Math.min(5, Math.floor(maxPages)));
    const userIds = new Set<string>();
    let paginationToken = "";
    for (let page = 0; page < pages; page++) {
      const query = new URLSearchParams({ max_results: "100", "user.fields": "id" });
      if (paginationToken) query.set("pagination_token", paginationToken);
      const result = await this.json(credentials, `/tweets/${id}/retweeted_by?${query.toString()}`);
      if (Array.isArray(result.data)) {
        for (const user of result.data) {
          if (!user || typeof user !== "object") continue;
          const userId = (user as Record<string, unknown>).id;
          if (typeof userId === "string" && /^\d{1,19}$/.test(userId)) userIds.add(userId);
        }
      }
      if (userIds.has(credentials.xUserId)) return { userIds: [...userIds], complete: true };
      const meta = result.meta && typeof result.meta === "object" ? result.meta as Record<string, unknown> : {};
      const next = typeof meta.next_token === "string" && meta.next_token.length <= 500 ? meta.next_token : "";
      if (!next) return { userIds: [...userIds], complete: true };
      if (page + 1 === pages) return { userIds: [...userIds], complete: false };
      paginationToken = next;
    }
    return { userIds: [...userIds], complete: false };
  }

  private processingState(state: unknown, imageFinalizeIsReady: boolean): OfficialXMediaReceipt["processingState"] {
    if (state === "pending" || state === "in_progress" || state === "succeeded" || state === "failed") return state;
    return imageFinalizeIsReady ? "succeeded" : "unknown";
  }

  private postReceipt(result: Record<string, unknown>): OfficialXPostReceipt {
    const data = result.data as Record<string, unknown> | undefined;
    if (typeof data?.id !== "string" || typeof data.text !== "string") {
      throw new OfficialXError({ code: "unknown_remote_state", message: "X returned no usable post receipt. Reconcile before any retry.", safeToRetry: false, remoteStateKnown: false });
    }
    return { id: data.id, text: data.text };
  }
}

/** Backwards-compatible publisher name without a second class/facade. */
export { OfficialXClient as OfficialXPublisher };
