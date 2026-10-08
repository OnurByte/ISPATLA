import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";
import { scanOnce } from "@/server/pipeline";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const denied = guardMutation(request, true);
  if (denied) return denied;
  return NextResponse.json(await scanOnce());
}

export const POST = withUser(POSTHandler, true);
