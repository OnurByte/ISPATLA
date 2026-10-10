import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { listPostgresPublicationIntents } from "@/server/postgres-queue-store";

export const runtime = "nodejs";

async function GETHandler() {
  return NextResponse.json(await listPostgresPublicationIntents(200));
}

export const GET = withUser(GETHandler);
