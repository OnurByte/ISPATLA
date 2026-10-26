import {localizeApiErrorResponse} from "./api-errors";
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
    const errorResponse=(error:string,status:number)=>localizeApiErrorResponse(request,NextResponse.json({error},{status}));
    let session;
    try { session = await requireSession(request); } catch {
      return errorResponse("Oturum hizmeti hazır değil",503);
    }
    if (!session) return errorResponse("Oturum gerekli",401);
    if (operatorOnly && session.user.id !== process.env.ISPATLA_OPERATOR_USER_ID) {
      return errorResponse("Bu işlem operatör yetkisi gerektiriyor",403);
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !mutationOriginAllowed(request)) {
      return errorResponse("İstek kaynağı doğrulanamadı",403);
    }
    return localizeApiErrorResponse(request,await runAsOwner(session.user.id, () => handler(...args)));
  };
}
