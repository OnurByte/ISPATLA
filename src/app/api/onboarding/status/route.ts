import { NextResponse } from "next/server";
import { onboardingSteps } from "@/server/onboarding";
import { verifyXApiCredentials } from "@/server/x-api";

export const runtime = "nodejs";

export async function GET() {
  const steps = onboardingSteps();
  const outstanding = steps.filter((step) => step.required && !step.done);
  return NextResponse.json({
    steps,
    // One boolean the screen keys off: any required step still open.
    incomplete: outstanding.length > 0,
    outstanding: outstanding.map((step) => step.id),
  });
}

export async function POST() {
  // A live check is what turns "configured" into "works", and the onboarding
  // screen asks for it on every path, so the button can report the real reason.
  return NextResponse.json(await verifyXApiCredentials());
}