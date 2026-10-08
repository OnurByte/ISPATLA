import { NextResponse } from "next/server";
import { requireSession } from "./auth";
import { runAsOwner } from "./owner-context";

export function mutationOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const allowed = [new URL(request.url).origin, process.env.BETTER_AUTH_URL];
  return allowed.some((value) => {
    if (!value) return false;
    try { return new URL(value).origin === origin; } catch { return false; }
  });
}

export function withUser<Args extends unknown[]>(handler: (...args: Args) => Response | Promise<Response>, operatorOnly = false) {
  return async (...args: Args): Promise<Response> => {
    const request = args[0];
    if (!(request instanceof Request)) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    let session;
    try { session = await requireSession(request); } catch {
      return NextResponse.json({ error: "Oturum hizmeti hazır değil" }, { status: 503 });
    }
    if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    if (operatorOnly && session.user.id !== process.env.ISPATLA_OPERATOR_USER_ID) {
      return NextResponse.json({ error: "Bu işlem operatör yetkisi gerektiriyor" }, { status: 403 });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !mutationOriginAllowed(request)) {
      return NextResponse.json({ error: "İstek kaynağı doğrulanamadı" }, { status: 403 });
    }
    return runAsOwner(session.user.id, () => handler(...args));
  };
}
