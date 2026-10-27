// Tab-memory recovery for client navigation and browser Back. Nothing is written
// to browser storage or the server. A full reload still needs beforeunload.
const workspaces = new Map<string, unknown>();
let watching = false;
const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
const keyFor = (owner: string, context: string) => JSON.stringify([owner, context]);
export function readDraftRecovery<T>(owner: string, context: string): T | undefined {
  return owner ? workspaces.get(keyFor(owner, context)) as T | undefined : undefined;
}
export function retainDraftRecovery<T>(owner: string, context: string, snapshot: T | null) {
  if (!owner) return;
  const key = keyFor(owner, context);
  if (snapshot === null) workspaces.delete(key);
  else workspaces.set(key, snapshot);
  // Keep the warning active even while a different workspace page is open.
  if (typeof window !== "undefined") {
    if (workspaces.size && !watching) { window.addEventListener("beforeunload", warnBeforeUnload); watching = true; }
    if (!workspaces.size && watching) { window.removeEventListener("beforeunload", warnBeforeUnload); watching = false; }
  }
}
