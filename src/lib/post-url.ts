export function internalPostUrl(id: string): string {
  if (!/^\d{1,19}$/.test(id)) throw new Error("Invalid post ID");
  return `/post/${id}`;
}

export function postIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) return null;
    return /^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{1,19})\/?$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

export function postViewUrl(value: string): string {
  const id = postIdFromUrl(value);
  return id ? internalPostUrl(id) : value;
}
