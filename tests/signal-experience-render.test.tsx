import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SignalExperience } from "../src/components/landing/signal-experience";
import { getSignalPressCopy } from "../src/i18n/signal-press";

test("sample and draft cards show identities and disclose synthetic content without score metrics", () => {
  const copy = getSignalPressCopy("en");
  const markup = renderToStaticMarkup(<SignalExperience copy={copy} startHref="/signup" />);
  expect(markup).toContain('data-orientation="vertical"');
  expect(markup).toContain("@productnotes");
  expect(markup).toContain("@sample_account");
  expect(markup.split(copy.synthetic).length - 1).toBe(3);
  expect(markup).toContain(copy.accepted);
  expect(markup).not.toContain("/100");
  expect(markup).toContain("<del");
  expect(markup).toContain("<ins");
  expect(markup).toContain('data-slot="toggle-group"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('data-slot="avatar-fallback"');
  expect(markup).toContain('data-slot="card-header"');
  expect(markup).toContain('data-slot="card-content"');
  expect(markup).toContain('data-slot="card-footer"');
  expect(markup).toContain('data-slot="alert"');
  expect(markup).toMatch(/<a[^>]*href="#writing-room"[^>]*data-slot="button"/);
  expect(markup).toMatch(/<a[^>]*href="#writing-room"[^>]*role="link"/);
});

test("rejected examples show a rejection explanation instead of a publishable revised card", () => {
  const copy = getSignalPressCopy("en");
  const rejected = copy.examples.find((example) => example.verdict === "reject")!;
  const markup = renderToStaticMarkup(<SignalExperience copy={{ ...copy, examples: [rejected] }} startHref="/signup" />);
  expect(markup).toContain(copy.rejected);
  expect(markup).toContain(rejected.revised);
  expect(markup.split(copy.synthetic).length - 1).toBe(2);
  expect(markup).not.toContain("<ins");
  expect(markup).toContain('data-slot="alert-description"');
});
