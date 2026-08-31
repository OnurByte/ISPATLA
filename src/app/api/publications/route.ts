import { NextResponse } from "next/server";
import { getPublicationIntents } from "@/server/db";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getPublicationIntents({ limit: 200 }));
}
