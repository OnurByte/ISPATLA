import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getPendingPublicationIntents, getPublicationIntents } from "@/server/db";

export const runtime = "nodejs";

function GETHandler() {
  return NextResponse.json([...new Map([...getPendingPublicationIntents(200), ...getPublicationIntents({ limit: 200 })].map((intent) => [intent.id, intent])).values()]);
}

export const GET = withUser(GETHandler);
