import { NextResponse } from "next/server";
import { withUser } from "@/server/request-auth";
import { currentOwnerId } from "@/server/owner-context";
import { getAccounts } from "@/server/db";
import {
  adjudicateEvaluationPrediction,
  getEvaluationPrediction,
  listDueUnresolvedPredictions,
  listEvaluationLabels,
  listEvaluationPredictions,
  listEvaluationReplays,
  listEvaluationOutcomes,
  requireEvaluationAccount,
  type EvaluationPrediction,
  type OutcomeLabel,
} from "@/server/evaluation-store";
import { calibratedProbability, calibrateStoredModel, evaluateStoredHoldout } from "@/server/calibration";
import { latestCalibrationProfile } from "@/server/evaluation-store";

export const runtime = "nodejs";

const labels = new Set<OutcomeLabel>(["hit", "miss", "late_hit", "wrong_account", "wrong_format", "policy_block", "publisher_failure", "cannibalization"]);

function GETHandler(request: Request) {
  const accounts = getAccounts().map(({ id, handle, displayName }) => ({ id: String(id), handle, displayName }));
  const requestedAccount = new URL(request.url).searchParams.get("accountId");
  const accountId = requestedAccount || accounts[0]?.id;
  if (!accountId) return NextResponse.json({ accounts, selectedAccountId: null, models: [], predictions: [], calibration: null, replays: [] }, { headers: { "cache-control": "no-store" } });
  try { requireEvaluationAccount(accountId); } catch (error) {
    if (error instanceof Error && error.message.includes("evaluation account not found")) return NextResponse.json({ error: "evaluation account not found for owner" }, { status: 404 });
    throw error;
  }

  const requestedModel = new URL(request.url).searchParams.get("modelKey") || undefined;
  if (requestedModel && requestedModel.length > 200) return NextResponse.json({ error: "modelKey is too long" }, { status: 400 });
  const allPredictions = listEvaluationPredictions(accountId, requestedModel, 500);
  const labeled = listEvaluationLabels(undefined, requestedModel, accountId);
  const due = listDueUnresolvedPredictions(Math.floor(Date.now() / 1000), 500, { accountId, modelKey: requestedModel });
  const predictions = new Map<string, { prediction: EvaluationPrediction; label: OutcomeLabel | null }>();
  for (const prediction of allPredictions) predictions.set(prediction.id, { prediction, label: null });
  for (const item of labeled) predictions.set(item.prediction.id, { prediction: item.prediction, label: item.label });
  for (const prediction of due) if (!predictions.has(prediction.id)) predictions.set(prediction.id, { prediction, label: null });
  const models = [...new Set(listEvaluationPredictions(accountId, undefined, 500).map((prediction) => prediction.modelKey))].sort();
  const profile = requestedModel ? latestCalibrationProfile(JSON.stringify([accountId, requestedModel])) : null;
  const rows = [...predictions.values()].map(({ prediction, label }) => ({
    id: prediction.id,
    accountId: prediction.accountId,
    candidateId: prediction.candidateId,
    modelKey: prediction.modelKey,
    split: prediction.split,
    rawScore: prediction.rawScore,
    calibratedProbability: profile?.status === "calibrated" && prediction.modelKey === requestedModel
      ? calibratedProbability(prediction.rawScore, profile)
      : null,
    decision: typeof prediction.features.decision === "string" ? prediction.features.decision : "unknown",
    reason: typeof prediction.features.reason === "string" ? prediction.features.reason : typeof prediction.features.decisionReason === "string" ? prediction.features.decisionReason : "Stored decision reason unavailable",
    riskTier: prediction.riskTier || "unknown",
    selectionPropensity: prediction.selectionPropensity,
    createdAt: prediction.createdAt,
    resolveBy: prediction.resolveBy,
    due: prediction.resolveBy <= Math.floor(Date.now() / 1000),
    label,
    outcomes: listEvaluationOutcomes(prediction.id).map((outcome) => ({
      observedAt: outcome.observedAt,
      capturedAt: outcome.capturedAt,
      metrics: outcome.metrics,
      censored: outcome.censored,
      source: outcome.source,
    })),
  })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);

  return NextResponse.json({
    accounts,
    selectedAccountId: accountId,
    selectedModelKey: requestedModel || "",
    historyLimit: 500,
    models,
    predictions: rows,
    calibration: profile ? { status: profile.status, sampleCount: profile.sampleCount, mapping: profile.mapping } : null,
    replays: listEvaluationReplays(accountId, requestedModel, 100),
  }, { headers: { "cache-control": "no-store" } });
}

async function POSTHandler(request: Request) {
  const owner = currentOwnerId();
  if (!owner) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 16_384) return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid JSON object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "label") {
      if (typeof body.predictionId !== "string" || body.predictionId.length > 100 || typeof body.label !== "string" || !labels.has(body.label as OutcomeLabel)) {
        return NextResponse.json({ error: "predictionId and a supported label are required" }, { status: 400 });
      }
      const prediction = getEvaluationPrediction(body.predictionId);
      if (!prediction) return NextResponse.json({ error: "prediction not found for owner" }, { status: 404 });
      requireEvaluationAccount(prediction.accountId);
      if (listEvaluationLabels(undefined, undefined, prediction.accountId).some((item) => item.prediction.id === prediction.id)) {
        return NextResponse.json({ error: "prediction already has an immutable label" }, { status: 409 });
      }
      adjudicateEvaluationPrediction({ predictionId: prediction.id, label: body.label as OutcomeLabel, reviewerRef: owner, labeledAt: Math.floor(Date.now() / 1000) });
      return NextResponse.json({ labeled: true }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "replay") {
      if (typeof body.accountId !== "string" || !/^\d+$/.test(body.accountId) || typeof body.modelKey !== "string" || !body.modelKey.trim() || body.modelKey.length > 200) {
        return NextResponse.json({ error: "accountId and modelKey are required" }, { status: 400 });
      }
      requireEvaluationAccount(body.accountId);
      const now = Math.floor(Date.now() / 1000);
      const calibration = calibrateStoredModel({ accountId: body.accountId, modelKey: body.modelKey, now });
      const holdout = evaluateStoredHoldout({ accountId: body.accountId, modelKey: body.modelKey, now });
      return NextResponse.json({ calibration, holdout }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Unsupported evaluation action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "evaluation action failed";
    if (/already exists|UNIQUE constraint/i.test(message)) return NextResponse.json({ error: "prediction already has an immutable label" }, { status: 409 });
    if (/not found for owner/.test(message)) return NextResponse.json({ error: message }, { status: 404 });
    if (/evaluation account not found/.test(message)) return NextResponse.json({ error: message }, { status: 404 });
    if (/required|must be|invalid|unknown|supported/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: "Evaluation action failed" }, { status: 500 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
