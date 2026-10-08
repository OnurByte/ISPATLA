import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { guardMutation } from "@/server/api-guard";
import { reconcilePending } from "@/server/pipeline";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  const denied = guardMutation(request, true);
  if (denied) return denied;
  return NextResponse.json({ confirmed: await reconcilePending() });
}

export const POST = withUser(POSTHandler, true);
