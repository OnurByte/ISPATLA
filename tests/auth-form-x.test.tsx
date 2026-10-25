import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthForm } from "../src/components/auth-form";
import { authCopy } from "../src/i18n/auth-copy";
import { LOCALES } from "../src/i18n/config";

const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

test("login and signup expose a native 𝕏 button with provider readiness in every locale", () => {
  for (const locale of LOCALES) {
    for (const mode of ["login", "signup"] as const) {
      for (const xLoginEnabled of [true, false]) {
        const html = renderToStaticMarkup(createElement(AuthForm, { locale, mode, xLoginEnabled }));
        const button = html.match(/<button[^>]*type="button"[^>]*>[\s\S]*?<\/button>/)?.[0];
        expect(button, `${locale}/${mode}/${xLoginEnabled}`).toBeDefined();
        expect(button).toContain(escaped(authCopy[locale].withX));
        expect(button).toContain("𝕏");
        expect(button).toContain('data-slot="button"');
        expect(button?.includes('disabled=""')).toBe(!xLoginEnabled);
        expect(html.includes('id="x-login-unavailable"')).toBe(!xLoginEnabled);
        expect(html).toContain('data-slot="card"');
        expect(html).toContain('data-slot="field-group"');
      }
    }
  }
});

test("OAuth callback errors remain visible even when the provider becomes unavailable", () => {
  const html = renderToStaticMarkup(createElement(AuthForm, { mode: "login", locale: "tr", xLoginEnabled: false, xLoginError: "unable_to_get_user_info" }));
  expect(html).toContain('role="alert"');
  expect(html).toContain(escaped(authCopy.tr.xProfileMissing));
});

test("password recovery screens do not offer social login", () => {
  for (const mode of ["forgot", "reset"] as const) {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode, xLoginEnabled: true }));
    expect(html).not.toContain('type="button"');
  }
});
