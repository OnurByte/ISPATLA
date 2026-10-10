import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/server/dashboard";

export const runtime = "nodejs";

async function GETHandler() {
  return NextResponse.json(await getDashboardSummary());
}

export const GET = withUser(GETHandler);
