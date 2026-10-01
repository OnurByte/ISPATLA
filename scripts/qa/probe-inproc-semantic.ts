/* eslint-disable */
// Calls the app's OWN requestDraftSemanticFeatures() — not a hand-rolled copy —
// so the reported failure is the one the panel actually hits.
//
// Run with: bun --preload ./scripts/bun-sqlite-shim.mjs scripts/qa/probe-inproc-semantic.ts

export {};

const mod: any = await import("../../src/server/ai");

const t0 = Date.now();
try {
  const value = await mod.requestDraftSemanticFeatures({
    text: "Bursa ve çevresinde kuvmetli yağmur uyarısı yapıldı. Sel riski taşıyan bölgelerde tedbir alınmalı.",
    accountHandle: process.env.ACCOUNT_HANDLE || "",
    accountContext: { tone: "sade, kanıt odaklı, kısa" },
    format: "post",
  });
  console.log(`elapsed_ms=${Date.now() - t0}`);
  console.log("OK", JSON.stringify(value, null, 2).slice(0, 900));
} catch (error: any) {
  console.log(`elapsed_ms=${Date.now() - t0}`);
  console.log("THREW:", error?.message || String(error));
  if (error?.cause) console.log("cause:", error.cause?.message || error.cause);
  console.log("stack:", String(error?.stack || "").split("\n").slice(0, 6).join("\n"));
}
