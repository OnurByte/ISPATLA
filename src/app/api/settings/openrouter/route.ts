import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const unavailable = () => NextResponse.json({ connected: false, runtimeAvailable: false, error: "OpenRouter bağlantısı PostgreSQL geçişi sırasında kullanılamıyor." }, { status: 503 });
function GETHandler() { return unavailable(); }
function POSTHandler(request: Request) { return guardMutation(request) || unavailable(); }
function DELETEHandler(request: Request) { return guardMutation(request) || unavailable(); }

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
export const DELETE = withUser(DELETEHandler);
