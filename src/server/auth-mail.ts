export type AuthEmailKind = "verification" | "password-reset";

export async function sendAuthEmail(
  kind: AuthEmailKind,
  input: { email: string; url: string },
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const endpoint = env.ISPATLA_MAIL_API_URL;
  const token = env.ISPATLA_MAIL_API_TOKEN;
  if (!endpoint || !token) throw new Error("authentication email transport is not configured");

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("authentication email transport URL is invalid");
  }
  if (url.username || url.password || url.hash) throw new Error("authentication email transport URL is invalid");
  const localHttp = env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("authentication email transport must use HTTPS");

  const subject = kind === "verification" ? "Verify your İSPATLA email" : "Reset your İSPATLA password";
  const action = kind === "verification" ? "verify your email" : "reset your password";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: input.email,
      subject,
      text: `Use this link to ${action}: ${input.url}`,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`authentication email transport failed (${response.status})`);
}
