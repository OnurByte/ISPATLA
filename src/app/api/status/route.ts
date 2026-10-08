import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/server/dashboard";

export const runtime = "nodejs";

function GETHandler() {
  return NextResponse.json(getDashboardSummary());
}

export const GET = withUser(GETHandler);
