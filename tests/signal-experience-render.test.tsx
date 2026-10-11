import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SignalExperience } from "../src/components/landing/signal-experience";
import { getSignalPressCopy } from "../src/i18n/signal-press";

test("sample and draft cards show identities and disclose synthetic content without score metrics", () => {
  const copy = getSignalPressCopy("en");
  const markup = renderToStaticMarkup(<SignalExperience copy={copy} startHref="/signup" />);
  expect(markup).toContain("@productnotes");
  expect(markup).toContain("@sample_account");
  expect(markup.split(copy.synthetic).length - 1).toBe(3);
  expect(markup).toContain(copy.accepted);
  expect(markup).not.toContain("/100");
  expect(markup).toContain("<del");
  expect(markup).toContain("<ins");
});

test("rejected examples show a rejection explanation instead of a publishable revised card", () => {
  const copy = getSignalPressCopy("en");
  const rejected = copy.examples.find((example) => example.verdict === "reject")!;
  const markup = renderToStaticMarkup(<SignalExperience copy={{ ...copy, examples: [rejected] }} startHref="/signup" />);
  expect(markup).toContain(copy.rejected);
  expect(markup).toContain(rejected.revised);
  expect(markup.split(copy.synthetic).length - 1).toBe(2);
  expect(markup).not.toContain("<ins");
});
