import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";
import type { MarketView } from "@/server/db-types";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresMarketInbox } from "@/server/postgres-sources-market";

export const runtime = "nodejs";
const MARKET_VIEWS = ["opportunities", "observed", "rejected", "sensitive"] as const;

function boundedInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(max, parsed) : fallback;
}

async function GETHandler(request: Request) {
  const search = new URL(request.url).searchParams;
  const candidate = search.get("view");
  const view = MARKET_VIEWS.includes(candidate as MarketView) ? candidate as MarketView : "opportunities";
  return NextResponse.json(await getPostgresMarketInbox(currentOwnerId()!, {
    view,
    limit: boundedInteger(search.get("limit"), 50, 100),
    offset: boundedInteger(search.get("offset"), 0, 10_000),
  }));
}

export const GET = withUser(GETHandler);
