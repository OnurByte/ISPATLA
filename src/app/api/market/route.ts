import { NextResponse } from "next/server";
import { getMarketInbox, MARKET_VIEWS, type MarketView } from "@/server/db";

export const runtime = "nodejs";

function boundedInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(max, parsed) : fallback;
}

export function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const candidate = search.get("view");
  const view = MARKET_VIEWS.includes(candidate as MarketView) ? candidate as MarketView : "opportunities";
  return NextResponse.json(getMarketInbox({
    view,
    limit: boundedInteger(search.get("limit"), 50, 100),
    offset: boundedInteger(search.get("offset"), 0, 10_000),
  }));
}
