import { expect, mock, test } from "bun:test";
import * as React from "react";
import { getSignalPressCopy } from "../src/i18n/signal-press";

const recorded: string[] = [];
mock.module("react", () => ({ ...React, useState: (initial: unknown) => [initial, () => {}], useRef: (current: unknown) => ({ current }) }));
mock.module("@/lib/landing-measurement", () => ({ trackLandingEvent: (event: string) => recorded.push(event) }));
mock.module("@/components/auth-session-sync", () => ({ announceSessionChange: () => {} }));

function findElements(value: unknown, type: string): Array<React.ReactElement<Record<string, unknown>>> {
  if (Array.isArray(value)) return value.flatMap((child) => findElements(child, type));
  if (!React.isValidElement<Record<string, unknown>>(value)) return [];
  return [...(value.type === type ? [value] : []), ...findElements(value.props.children, type)];
}

test("demo completion requires selecting a source and inspecting its revision, once", async () => {
  const { SignalExperience } = await import("../src/components/landing/signal-experience");
  recorded.length = 0;
  const tree = SignalExperience({ copy: getSignalPressCopy("en"), startHref: "/signup" });
  const select = findElements(tree, "button")[0].props.onClick as () => void;
  const inspect = findElements(tree, "a").find((item) => item.props.href === "#writing-room")!.props.onClick as () => void;
  inspect();
  expect(recorded).toEqual([]);
  select();
  select();
  expect(recorded).toEqual(["demo_start"]);
  inspect();
  inspect();
  expect(recorded).toEqual(["demo_start", "demo_complete"]);
});

test("signup conversion requires a successful confirmed user response; login never emits it", async () => {
  const { AuthForm } = await import("../src/components/auth-form");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://ispatla.tr", assign: () => {} } } });
  try {
    for (const [mode, status, data, expected] of [
      ["signup", 400, { user: { id: "private-user" } }, []],
      ["signup", 200, {}, []],
      ["signup", 200, { user: { id: "private-user" } }, ["signup_complete"]],
      ["login", 200, { user: { id: "private-user" } }, []],
    ] as const) {
      recorded.length = 0;
      globalThis.fetch = Object.assign(async () => Response.json(data, { status }), { preconnect: originalFetch.preconnect });
      const tree = AuthForm({ mode });
      const submit = findElements(tree, "form")[0].props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>;
      await submit({ preventDefault: () => {} });
      expect(recorded).toEqual([...expected]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
