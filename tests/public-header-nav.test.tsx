import Link from "next/link";
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicHeaderNav } from "../src/components/public-header-nav";

test("public navigation keeps one link tree and an accessible mobile toggle", () => {
  const markup = renderToStaticMarkup(<PublicHeaderNav brand={<Link href="/">ispatla.tr</Link>} label="Menu"><Link href="/docs">Tour</Link><Link href="/login">Log in</Link></PublicHeaderNav>);
  expect(markup).toContain('aria-label="Menu"');
  expect(markup).toContain('aria-expanded="false"');
  expect(markup).toContain('aria-controls=');
  expect(markup).toContain('data-slot="collapsible-content"');
  expect(markup).toContain('data-[closed]:hidden lg:col-span-1 lg:block!');
  expect(markup).not.toMatch(/hidden=""/);
  expect(markup.match(/href="\/docs"/g)).toHaveLength(1);
  expect(markup.match(/<nav /g)).toHaveLength(1);
});
