import { getArenaRankings } from "@/server/arena-rankings";
import { withUser } from "@/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler() { return NextResponse.json(await getArenaRankings()); }
export const GET = withUser(GETHandler);
