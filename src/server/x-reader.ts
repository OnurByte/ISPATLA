import { isAllowedFxTwitterFeed, safeStatusUrl } from "./security";

export type XMetricSnapshot = {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  views: number | null;
  pollVotes: number | null;
  capturedAt: number;
  quality: "ok" | "partial" | "missing";
};

export type XProfile = {
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string;
  followers: number | null;
  following: number | null;
  statuses: number | null;
  likes: number | null;
  mediaCount: number | null;
  verification: "blue" | "organization" | "government" | "not_verified" | "unknown";
};

export type XMedia = {
  type: "photo" | "video";
  url: string;
  variants: Array<{ url: string; contentType: string; bitrate: number | null }>;
};

export type XPost = {
  id: string;
  url: string;
  text: string;
  createdAt: number;
  author: XProfile;
  metrics: XMetricSnapshot;
  media: XMedia[];
  sensitive: boolean;
  discovery: { quoteAuthor: string; replyTo: string; mentions: string[] };
};

export type XTimelineBatch = { posts: XPost[]; cursor: string; receivedAt: number };
export type XSearchResult = XTimelineBatch & { query: string };

export type XReaderHealth = {
  transport: "fxtwitter";
  checkedAt: number;
  ok: boolean;
  latencyMs: number;
  freshnessSeconds: number | null;
  missingFields: string[];
  schemaDrift: boolean;
  error?: string;
};

export type XReaderCapabilities = {
  timeline: boolean;
  search: boolean;
  conversation: boolean;
  postMetrics: boolean;
  profile: boolean;
};

export interface XReader {
  fetchTimeline(input: { handle: string; maxPosts?: number; cursor?: string }): Promise<XTimelineBatch>;
  search(input: { query: string; count?: number; cursor?: string }): Promise<XSearchResult>;
  fetchConversation(input: { externalId: string; cursor?: string }): Promise<XTimelineBatch>;
  fetchPostMetrics(input: { externalId: string }): Promise<XPost>;
  fetchProfile(input: { handle: string }): Promise<XProfile>;
  capabilities(): XReaderCapabilities;
  health(): XReaderHealth;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function metric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function handle(value: unknown): string {
  return text(value).replace(/^@/, "").toLowerCase();
}

function verification(value: unknown): XProfile["verification"] {
  const item = record(record(value).verification);
  if (item.verified === false) return "not_verified";
  const type = text(item.type).toLocaleLowerCase("en-US");
  if (item.verified === true && type === "individual") return "blue";
  if (item.verified === true && type === "organization") return "organization";
  if (item.verified === true && type === "government") return "government";
  return "unknown";
}

function profile(value: unknown): XProfile {
  const item = record(value);
  return {
    handle: handle(item.screen_name || item.username || item.handle),
    name: text(item.name),
    bio: text(item.description || item.bio),
    avatarUrl: text(item.avatar_url || item.avatarUrl),
    followers: metric(item.followers),
    following: metric(item.following),
    statuses: metric(item.statuses),
    likes: metric(item.likes),
    mediaCount: metric(item.media_count),
    verification: verification(item),
  };
}

function media(value: unknown): XMedia[] {
  const all = record(value).all;
  const items = Array.isArray(all) ? all : [];
  return items.flatMap((entry) => {
    const item = record(entry);
    const type = item.type === "photo" || item.type === "video" ? item.type : null;
    if (!type) return [];
    const variants = Array.isArray(item.formats) ? item.formats.map((variant) => {
      const format = record(variant);
      return { url: text(format.url), contentType: text(format.content_type || format.contentType || format.container), bitrate: metric(format.bitrate) };
    }).filter((variant) => variant.url) : [];
    return [{ type, url: text(item.url), variants } satisfies XMedia];
  });
}

function mentionHandles(tweet: JsonRecord): string[] {
  const facets = record(tweet.raw_text).facets;
  return [...new Set((Array.isArray(facets) ? facets : []).flatMap((value) => {
    const item = record(value);
    return item.type === "mention" ? [handle(item.original || item.display || item.replacement)] : [];
  }).filter(Boolean))];
}

export function normalizeFxPost(value: unknown, fallbackHandle = "", capturedAt = Math.floor(Date.now() / 1000)): XPost | null {
  const wrapper = record(value);
  const tweet = record(wrapper.tweet || wrapper.status || wrapper);
  const id = text(tweet.id || wrapper.id);
  const postText = text(tweet.text);
  if (!/^\d+$/.test(id) || !postText) return null;
  const author = profile(tweet.author);
  const poll = record(tweet.poll);
  const metrics: XMetricSnapshot = {
    likes: metric(tweet.likes),
    replies: metric(tweet.replies),
    reposts: metric(tweet.reposts ?? tweet.retweets),
    quotes: metric(tweet.quotes),
    views: metric(tweet.views),
    pollVotes: metric(poll.total_votes ?? poll.totalVotes),
    capturedAt,
    quality: "ok",
  };
  const missing = [metrics.likes, metrics.replies, metrics.reposts, metrics.quotes, metrics.views, metrics.pollVotes].filter((item) => item === null).length;
  metrics.quality = missing === 6 ? "missing" : missing > 0 ? "partial" : "ok";
  const quote = record(tweet.quote);
  const replyingTo = record(tweet.replying_to);
  return {
    id,
    url: safeStatusUrl(text(tweet.url), author.handle || fallbackHandle, id),
    text: postText,
    createdAt: metric(tweet.created_timestamp ?? tweet.createdTimestamp) || 0,
    author: { ...author, handle: author.handle || handle(fallbackHandle) },
    metrics,
    media: media(tweet.media),
    sensitive: Boolean(tweet.possibly_sensitive) || /^\s*hassas\b/iu.test(postText),
    discovery: {
      quoteAuthor: profile(quote.author).handle,
      replyTo: profile(replyingTo).handle,
      mentions: mentionHandles(tweet),
    },
  };
}

export class FxTwitterReader implements XReader {
  private lastHealth: XReaderHealth = {
    transport: "fxtwitter", checkedAt: 0, ok: true, latencyMs: 0,
    freshnessSeconds: null, missingFields: [], schemaDrift: false,
  };

  capabilities(): XReaderCapabilities {
    return { timeline: true, search: true, conversation: true, postMetrics: true, profile: true };
  }

  async fetchTimeline(input: { handle: string; maxPosts?: number; cursor?: string }): Promise<XTimelineBatch> {
    const query = new URLSearchParams();
    if (input.cursor) query.set("cursor", input.cursor);
    const suffix = query.size ? `?${query}` : "";
    return this.batch(await this.fetchJson(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(input.handle)}/statuses${suffix}`), input.handle, input.maxPosts);
  }

  async search(input: { query: string; count?: number; cursor?: string }): Promise<XSearchResult> {
    const query = new URLSearchParams({ q: input.query, count: String(Math.max(1, Math.min(100, input.count || 20))) });
    if (input.cursor) query.set("cursor", input.cursor);
    return { ...this.batch(await this.fetchJson(`https://api.fxtwitter.com/2/search?${query}`), "", input.count), query: input.query };
  }

  async fetchConversation(input: { externalId: string; cursor?: string }): Promise<XTimelineBatch> {
    const query = input.cursor ? `?cursor=${encodeURIComponent(input.cursor)}` : "";
    return this.batch(await this.fetchJson(`https://api.fxtwitter.com/2/conversation/${encodeURIComponent(input.externalId)}${query}`));
  }

  async fetchPostMetrics(input: { externalId: string }): Promise<XPost> {
    const payload = record(await this.fetchJson(`https://api.fxtwitter.com/status/${encodeURIComponent(input.externalId)}`));
    const results = Array.isArray(payload.results) ? payload.results : [];
    const post = normalizeFxPost(payload.tweet || payload.status || results[0], "", Math.floor(Date.now() / 1000));
    if (!post) throw new Error("FxTwitter post schema is missing id or text");
    return post;
  }

  async fetchProfile(input: { handle: string }): Promise<XProfile> {
    const payload = record(await this.fetchJson(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(input.handle)}`));
    const result = profile(payload.user || payload.profile || payload.author);
    if (!result.handle) this.drift(["profile.handle"]);
    return result;
  }

  health(): XReaderHealth {
    return this.lastHealth;
  }

  private batch(payload: unknown, fallbackHandle = "", limit = 100): XTimelineBatch {
    const value = record(payload);
    const receivedAt = Math.floor(Date.now() / 1000);
    const results = Array.isArray(value.results) ? value.results : [];
    const posts = results.flatMap((entry) => {
      if (record(entry).type && record(entry).type !== "status") return [];
      const post = normalizeFxPost(entry, fallbackHandle, receivedAt);
      return post ? [post] : [];
    }).slice(0, Math.max(1, Math.min(100, limit)));
    const missingFields = results.length > 0 && posts.length === 0 ? ["results[].id", "results[].text"] : [];
    const newest = posts.reduce((latest, post) => Math.max(latest, post.createdAt), 0);
    this.lastHealth = {
      ...this.lastHealth,
      freshnessSeconds: newest ? Math.max(0, receivedAt - newest) : null,
      missingFields,
      schemaDrift: missingFields.length > 0,
    };
    return { posts, cursor: text(value.cursor || value.next_cursor || value.nextCursor), receivedAt };
  }

  private drift(missingFields: string[]): void {
    this.lastHealth = { ...this.lastHealth, missingFields, schemaDrift: true };
  }

  private async fetchJson(url: string): Promise<unknown> {
    if (!isAllowedFxTwitterFeed(url)) throw new Error("JSON URL is outside the FxTwitter allowlist");
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Ispatla/0.1 (+independent-news-research)" },
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!response.body) throw new Error("response body missing");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > 8 * 1024 * 1024) throw new Error("JSON response exceeds 8 MiB");
          chunks.push(chunk.value);
        }
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const result = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      this.lastHealth = {
        transport: "fxtwitter", checkedAt: Math.floor(Date.now() / 1000), ok: true,
        latencyMs: Math.round(performance.now() - startedAt), freshnessSeconds: this.lastHealth.freshnessSeconds,
        missingFields: [], schemaDrift: false,
      };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastHealth = {
        ...this.lastHealth, checkedAt: Math.floor(Date.now() / 1000), ok: false,
        latencyMs: Math.round(performance.now() - startedAt), error: message,
      };
      throw error;
    }
  }
}
