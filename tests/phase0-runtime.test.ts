import { expect, test } from "bun:test";
import { getAutomationRuntime } from "../src/server/dashboard";
import { runDueMonitors } from "../src/server/monitoring";

test("dashboard does not claim an automation heartbeat while PG worker ownership is unavailable", () => {
  expect(getAutomationRuntime()).toEqual({ owner: "none", heartbeatAt: null, healthy: false, lagSeconds: null });
});

test("monitor worker stays closed until owner-scoped PostgreSQL source monitoring exists", async () => {
  expect(await runDueMonitors()).toEqual({ attempted: 0, failed: 0, skipped: 1 });
});
