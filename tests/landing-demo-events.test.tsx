import { expect, mock, test } from "bun:test";
import * as React from "react";
import { getSignalPressCopy } from "../src/i18n/signal-press";

const recorded: string[] = [];
mock.module("react", () => ({ ...React, useState: (initial: unknown) => [initial, () => {}], useRef: (current: unknown) => ({ current }) }));
mock.module("@/lib/landing-measurement", () => ({ trackLandingEvent: (event: string) => recorded.push(event) }));

function find(value: unknown, slot: string): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) return value.map(child => find(child, slot)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(value)) return undefined;
  if (typeof value.type === "function" && value.type.name === slot) return value;
  return find(value.props.children, slot);
}

test("native source interaction and inspect emit each demo event once, including current selection", async () => {
  const { SignalExperience } = await import("../src/components/landing/signal-experience");
  const tree = SignalExperience({ copy: getSignalPressCopy("en"), startHref: "/signup" });
  const select = find(tree, "ToggleGroup")!.props.onValueChange as (values: string[]) => void;
  const inspect = find(tree, "Button")!.props.onClick as () => void;
  inspect();
  expect(recorded).toEqual([]);
  select([]);
  select(["routine"]);
  inspect();
  inspect();
  expect(recorded).toEqual(["demo_start", "demo_complete"]);
});
