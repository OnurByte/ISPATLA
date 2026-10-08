import { NextResponse } from "next/server";
import { adminTokenState } from "./security";
import { currentOwnerId } from "./owner-context";
import { mutationOriginAllowed } from "./request-auth";

let lastMutationAt = 0;

const MAX_JSON_BODY_BYTES = 1024 * 1024;

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    throw new Error("JSON body exceeds 1 MiB");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BODY_BYTES) {
    throw new Error("JSON body exceeds 1 MiB");
  }
  const parsed = text.trim() ? JSON.parse(text) : {};
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

export function guardMutation(request: Request, rateLimited = false): NextResponse | null {
  if (currentOwnerId()) {
    if (!mutationOriginAllowed(request)) return NextResponse.json({ error: "İstek kaynağı doğrulanamadı" }, { status: 403 });
  }
  const auth = currentOwnerId() ? "valid" : adminTokenState(request);
  if (auth === "missing") {
    return NextResponse.json(
      { error: "ISPATLA_ADMIN_TOKEN must be configured for production mutations" },
      { status: 503 },
    );
  }
  if (auth === "invalid") {
    return NextResponse.json(
      { error: "admin authorization required" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  if (rateLimited && process.env.NODE_ENV === "production") {
    const now = Date.now();
    if (now - lastMutationAt < 15_000) {
      return NextResponse.json(
        { error: "mutation rate limit exceeded; retry after 15 seconds" },
        { status: 429, headers: { "Retry-After": "15" } },
      );
    }
    lastMutationAt = now;
  }
  return null;
}
