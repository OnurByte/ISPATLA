import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { listPostgresQueueJobs } from "@/server/postgres-queue-store";

export const runtime = "nodejs";

async function GETHandler() {
  return NextResponse.json(await listPostgresQueueJobs());
}

export const GET = withUser(GETHandler);
