import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  const url = new URL(request.url);
  const base = process.env.BETTER_AUTH_URL || url.origin;
  const destination = new URL("/settings/keys", base);
  destination.searchParams.set("openrouter", "unavailable");
  return NextResponse.redirect(destination, 303);
}

export const GET = withUser(GETHandler);
