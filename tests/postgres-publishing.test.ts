import { expect, test } from "bun:test";
import { mayRetryExpiredDispatch, retryDelaySeconds } from "@/server/postgres-publishing";

test("PostgreSQL lease recovery never retries after the remote-write fence", () => {
  expect(mayRetryExpiredDispatch({ remoteWriteStartedAt: null, approvalValid: true, attempts: 1, maxAttempts: 5 })).toBe(true);
  expect(mayRetryExpiredDispatch({ remoteWriteStartedAt: 12, approvalValid: true, attempts: 1, maxAttempts: 5 })).toBe(false);
  expect(mayRetryExpiredDispatch({ remoteWriteStartedAt: null, approvalValid: false, attempts: 1, maxAttempts: 5 })).toBe(false);
  expect(mayRetryExpiredDispatch({ remoteWriteStartedAt: null, approvalValid: true, attempts: 5, maxAttempts: 5 })).toBe(false);
});

test("PostgreSQL retries use bounded exponential delay", () => {
  expect(retryDelaySeconds(1, { random: () => 0 })).toBe(15);
  expect(retryDelaySeconds(2, { random: () => 0 })).toBe(30);
  expect(retryDelaySeconds(99, { baseDelaySeconds: 30, maxDelaySeconds: 90, random: () => 1 })).toBe(90);
});
