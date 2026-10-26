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
  if (!(index in hookValues)) hookValues[index] = typeof initial === "function" ? (initial as () => T)() : initial;
  return [hookValues[index] as T, (next) => { hookValues[index] = typeof next === "function" ? (next as (previous: T) => T)(hookValues[index] as T) : next; }];
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
  if (typeof node.type === "function" && node.type.name === "CampaignDraftCard") {
    return elements((node.type as (props:Record<string,unknown>)=>React.ReactNode)(node.props),tag);
  }
  return [
    ...(node.type === tag ? [node] : []),
    ...elements(node.props.children, tag),
  ];
}

async function renderPreview(locale: (typeof LOCALES)[number]) {
  const { CampaignPreview } = await import("../src/components/landing/campaign-preview");
  const copy = getCampaignLandingCopy(locale);
  hookCursor = 0;
  return { copy, tree: CampaignPreview({ locale, copy: copy.preview, demo: copy.demo }) };
}

beforeEach(() => {
  resetHooks();
  recordedEvents.length = 0;
});

test("localized workbench shows topic, account fit, and distinct editable drafts without synthetic source metrics", async () => {
  const { CampaignPreview } = await import("../src/components/landing/campaign-preview");
  for (const locale of LOCALES) {
    const copy = getCampaignLandingCopy(locale);
    const markup = renderToStaticMarkup(<CampaignPreview locale={locale} copy={copy.preview} demo={copy.demo} />);
    expect(markup).toContain(copy.demo.topicTitle);
    expect(markup).toContain(copy.demo.topicBrief);
    expect(markup).toContain("Just released a major upgrade to @Grok Imagine!");
    expect(markup).toContain("Another major upgrade coming in 3 weeks.");
    expect(markup).toContain("href=\"https://x.com/elonmusk/status/2007731379342291029\"");
    expect(markup).toContain("href=\"https://x.com/elonmusk\"");
    expect(markup).toContain("dateTime=\"2026-01-04T08:30:37Z\"");
    expect(markup).toContain(copy.demo.sourceLinkLabel);
    expect(markup).toContain(copy.demo.fitReasons[0]);
    expect(markup).toContain(copy.demo.drafts[0]);
    expect(copy.demo.drafts).toHaveLength(3);
    expect(new Set(copy.demo.drafts).size).toBe(3);
    for (const role of copy.preview.roles) expect(markup).toContain(role);
    expect(markup).toContain(copy.preview.individual);
    expect(markup).toContain(copy.preview.bulk);
    expect(markup).toContain("<textarea");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain(copy.preview.impressions);
    expect(markup).not.toContain(copy.preview.followers);
    expect(markup).not.toContain("@exampledev");
    expect(markup).not.toContain("source link");
  }
});

test("account selection changes the rationale, edits persist, and bulk review exposes all account drafts", async () => {
  const { copy, tree } = await renderPreview("en");
  const accountButtons = elements(tree, "button").filter((button) => copy.preview.roles.includes(textContent(button.props.children)));
  const nextAccount = accountButtons.find((button) => button.props["aria-pressed"] === false)!;
  (nextAccount.props.onClick as () => void)();
  expect(recordedEvents).toEqual(["demo_start"]);

  const { tree: selectedTree } = await renderPreview("en");
  expect(textContent(selectedTree)).toContain(copy.demo.fitReasons[1]);
  const reviewButtons = elements(selectedTree, "button").filter((button) =>
    button.props["aria-pressed"] !== undefined && [copy.preview.individual, copy.preview.bulk].includes(textContent(button.props.children)),
  );
  const bulk = reviewButtons.find((button) => textContent(button.props.children) === copy.preview.bulk)!;
  (bulk.props.onClick as () => void)();
  expect(recordedEvents).toEqual(["demo_start"]);

  const { tree: bulkTree } = await renderPreview("en");
  const editors = elements(bulkTree, "textarea");
  expect(editors).toHaveLength(3);
  expect(editors.map((editor) => editor.props.value)).toEqual(copy.demo.drafts);
  (editors[1].props.onChange as (event: { currentTarget: { value: string } }) => void)({ currentTarget: { value: "Edited by a visitor" } });
  expect(hookValues[2]).toContainEqual({text:"Edited by a visitor",approved:false});
  const {tree: editedTree}=await renderPreview("en");
  const approve=elements(editedTree,"button").find(button=>button.props["aria-label"]===`Approve draft ⁜ ${copy.preview.roles[1]}`)!;
  (approve.props.onClick as ()=>void)();
  expect(recordedEvents).toEqual(["demo_start","demo_complete"]);
  const {tree: approvedTree}=await renderPreview("en");
  const approvedEditor=elements(approvedTree,"textarea")[1];
  (approvedEditor.props.onChange as (event:{currentTarget:{value:string}})=>void)({currentTarget:{value:"Changed after approval"}});
  expect((hookValues[2] as {approved:boolean}[])[1].approved).toBe(false);
});
