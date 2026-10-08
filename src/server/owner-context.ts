import { AsyncLocalStorage } from "node:async_hooks";

const owner = new AsyncLocalStorage<string>();

/** Only verified server session wrappers bind an owner; no context is reserved for trusted internal workers. */
export function runAsOwner<T>(userId: string, callback: () => T): T {
  if (!userId.trim()) throw new Error("owner user id is required");
  return owner.run(userId, callback);
}

export function currentOwnerId(): string | undefined {
  return owner.getStore();
}
