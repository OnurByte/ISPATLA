import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getJobs } from "@/server/db";

export const runtime = "nodejs";

function GETHandler() {
  return NextResponse.json(getJobs());
}

export const GET = withUser(GETHandler);
