import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";
import { retainDraftRecovery } from "@/lib/draft-recovery";
import type { PgDraft } from "@/server/postgres-drafts";
const hooks: unknown[] = [];
let cursor = 0;
mock.module("react", () => ({ ...React,
  useState(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], (value: unknown) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
  useEffect() {},
}));
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
mock.module("@/i18n/ui-client", () => ({ useUiText: () => ({ locale: "en", t: (text: string) => text }) }));
const { DraftsPage } = await import("@/components/drafts-page");
const originalFetch = globalThis.fetch;
const initial = [{ id: 4, accountId: 1, accountHandle: "fixture", externalId: "123", sourceUrl: "https://x.com/fixture/status/123", sourceHandle: "fixture", format: "post", text: "Saved fixture draft with an original sentence.", status: "draft", score: 0, gateReason: "", evaluation: null }] as PgDraft[];
const accounts = [{ id: 1, handle: "fixture", displayName: "Fixture", enabled: true, defaultAccount: true, styleProfile: {} }];
const render = (sourcePostId?: string, ownerId?: string, records = initial) => { cursor = 0; return DraftsPage({ initial: records, accounts, sourcePostId, ownerId }); };
function nodes(node: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement<{ children?: unknown }>(node) ? text(node.props.children) : "";
}
const byId = (tree: unknown, id: string) => nodes(tree).find(node => node.props.id === id)!;
const button = (tree: unknown, label: string) => nodes(tree).find(node => (text(node.props.children).trim() === label || node.props["aria-label"] === label) && typeof node.props.onClick === "function")!;
const click = (node: React.ReactElement<Record<string, unknown>>) => (node.props.onClick as () => unknown)();
beforeEach(() => { cursor = 0; hooks.length = 0; });
afterEach(() => { globalThis.fetch = originalFetch; });

test("composer format changes do not rewrite the selected saved draft", async () => {
  const tree = render();
  const picker = nodes(tree).find(node => nodes(node.props.children).some(child => child.props.id === "batch-format") && typeof node.props.onValueChange === "function")!;
  (picker.props.onValueChange as (value: string) => void)("reply");
  let savedFormat = "";
  globalThis.fetch = mock(async (_url, init) => { if (init?.method) savedFormat = JSON.parse(String(init.body)).format; return Response.json(init?.method ? initial[0] : []); }) as unknown as typeof fetch;
  await click(button(render(), "Save"));
  expect(savedFormat).toBe("post");
});

test("opening a source reply starts blank instead of copying the first saved draft", () => {
  const tree = render("456");
  expect(byId(tree, "draft-text").props.value).toBe("");
});

test("unsaved editor text cannot be shared or queued as an older saved revision", () => {
  let tree = render();
  (byId(tree, "draft-text").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "My unsaved edit" } });
  tree = render();
  expect(button(tree, "Add to queue").props.disabled).toBe(true);
  expect(nodes(tree).some(node => typeof node.type === "function" && node.type.name === "PublishingMethods")).toBe(false);
});

test("a rejected save exits the busy state and keeps the user's text available to retry", async () => {
  let tree = render();
  (byId(tree, "draft-text").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "My unsaved edit" } });
  globalThis.fetch = mock(async () => { throw new TypeError("Network failed"); }) as unknown as typeof fetch;
  await Promise.resolve(click(button(render(), "Save"))).catch(() => {});
  tree = render();
  expect(byId(tree, "draft-text").props.value).toBe("My unsaved edit");
  expect(button(tree, "Save").props.disabled).toBe(false);
  expect(text(tree)).toContain("Could not save draft.");
});

test("clicking the selected draft keeps edits and declining replacement keeps the current text", () => {
  let tree = render();
  (byId(tree, "draft-text").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "My unsaved edit" } });
  tree = render();
  click(nodes(tree).find(node => node.props["data-selected"] === true)!);
  expect(byId(render(), "draft-text").props.value).toBe("My unsaved edit");
  const originalWindow = globalThis.window;
  try {
    globalThis.window = { confirm: () => false } as unknown as Window & typeof globalThis;
    click(button(render(), "New draft"));
    expect(byId(render(), "draft-text").props.value).toBe("My unsaved edit");
  } finally {
    if (originalWindow) globalThis.window = originalWindow;
    else Reflect.deleteProperty(globalThis, "window");
  }
});


test("returning to the editor recovers unsaved fields while using the latest server status", () => {
  const owner = "recovery-editor-fixture";
  retainDraftRecovery(owner, "default:", { form: { ...initial[0], text: "Retained unsaved text" }, baseline: initial[0], prompt: "My unfinished brief", manualText: "My other mode text" });
  const tree = render(undefined, owner, [{ ...initial[0]!, status: "blocked", gateReason: "latest server gate" }]);
  expect(byId(tree, "draft-text").props.value).toBe("Retained unsaved text");
  expect(byId(tree, "manual-prompt").props.value).toBe("My unfinished brief");
  expect(text(tree)).toContain("latest server gate");
  expect(button(tree, "Add to queue").props.disabled).toBe(true);
  retainDraftRecovery(owner, "default:", null);
});

test("composer recovery does not replace a newer saved revision with old unchanged editor text", () => {
  const owner = "recovery-composer-fixture";
  retainDraftRecovery(owner, "default:", { form: initial[0], baseline: initial[0], prompt: "My unfinished brief", manualText: "" });
  const tree = render(undefined, owner, [{ ...initial[0]!, text: "A newer saved revision" }]);
  expect(byId(tree, "draft-text").props.value).toBe("A newer saved revision");
  retainDraftRecovery(owner, "default:", null);
});
