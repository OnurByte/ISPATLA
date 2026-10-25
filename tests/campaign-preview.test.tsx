import { beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES } from "../src/i18n/config";
import { getCampaignLandingCopy } from "../src/i18n/campaign-landing";

const hookValues: unknown[] = [];
let hookCursor = 0;
const recordedEvents: string[] = [];

function mockState<T>(initial: T): [T, (next: T) => void] {
  const index = hookCursor++;
  if (!(index in hookValues)) hookValues[index] = initial;
  return [hookValues[index] as T, (next) => { hookValues[index] = next; }];
}

function mockRef<T>(initial: T) {
  const index = hookCursor++;
  if (!(index in hookValues)) hookValues[index] = { current: initial };
  return hookValues[index] as { current: T };
}

mock.module("react", () => ({ ...React, useState: mockState, useRef: mockRef, useId: () => "campaign-preview-test" }));
mock.module("@/lib/landing-measurement", () => ({ trackLandingEvent: (event: string) => recordedEvents.push(event) }));

function resetHooks() {
  hookCursor = 0;
  hookValues.length = 0;
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!React.isValidElement<{ children?: unknown }>(node)) return "";
  return textContent(node.props.children);
}

function elements(node: unknown, tag: string): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, tag));
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === tag ? [node] : []),
    ...elements(node.props.children, tag),
  ];
}

async function renderPreview(locale: (typeof LOCALES)[number]) {
  const { CampaignPreview } = await import("../src/components/landing/campaign-preview");
  const copy = getCampaignLandingCopy(locale);
  hookCursor = 0;
  return { copy, tree: CampaignPreview({ locale, copy: copy.preview }) };
}

beforeEach(() => {
  resetHooks();
  recordedEvents.length = 0;
});

test("server-rendered preview exposes its illustrative label, all accounts, periods, and review choices in every locale", async () => {
  const { CampaignPreview } = await import("../src/components/landing/campaign-preview");
  for (const locale of LOCALES) {
    const copy = getCampaignLandingCopy(locale);
    const markup = renderToStaticMarkup(<CampaignPreview locale={locale} copy={copy.preview} />);
    expect(markup).toContain(copy.preview.label);
    expect(markup).toContain(copy.preview.chartDescription);
    for (const role of copy.preview.roles) expect(markup).toContain(role);
    for (const day of copy.preview.days) expect(markup).toContain(day);
    expect(markup).toContain(copy.preview.individual);
    expect(markup).toContain(copy.preview.bulk);
    expect(markup).toContain('aria-pressed="true"');
  }
});

test("chart paths stay finite for valid points and ignore nonfinite samples", async () => {
  const { campaignChartPath } = await import("../src/components/landing/campaign-preview");
  for (const points of [[0, 50, 100], [-15, 35, 120], [0, Number.NaN, 100, Number.POSITIVE_INFINITY]]) {
    const path = campaignChartPath(points);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path).toMatch(/^M/);
  }
  expect(campaignChartPath([Number.NaN, Number.POSITIVE_INFINITY])).toBe("");
});

test("preview interaction emits aggregate start once and completion once for review-mode change", async () => {
  const { copy, tree } = await renderPreview("en");
  const periodButtons = elements(tree, "button").filter((button) => button.props["aria-pressed"] !== undefined && textContent(button.props.children).includes("day"));
  const currentPeriod = periodButtons.find((button) => button.props["aria-pressed"] === true)!;
  (currentPeriod.props.onClick as () => void)();
  expect(recordedEvents).toEqual([]);

  const otherPeriod = periodButtons.find((button) => button !== currentPeriod)!;
  (otherPeriod.props.onClick as () => void)();
  expect(recordedEvents).toEqual(["demo_start"]);

  const { tree: updatedTree } = await renderPreview("en");
  const reviewButtons = elements(updatedTree, "button").filter((button) =>
    button.props["aria-pressed"] !== undefined && [copy.preview.individual, copy.preview.bulk].includes(textContent(button.props.children)),
  );
  const individual = reviewButtons.find((button) => textContent(button.props.children) === copy.preview.individual)!;
  (individual.props.onClick as () => void)();
  expect(recordedEvents).toEqual(["demo_start", "demo_complete"]);

  const { tree: individualTree } = await renderPreview("en");
  const accountButtons = elements(individualTree, "button").filter((button) => copy.preview.roles.includes(textContent(button.props.children)));
  const selectedAccount = accountButtons.find((button) => button.props["aria-pressed"] === true)!;
  (selectedAccount.props.onClick as () => void)();
  expect(recordedEvents).toEqual(["demo_start", "demo_complete"]);
  expect(copy.preview.roles).toHaveLength(3);
});
