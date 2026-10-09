import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { getOnboardingRedirect } from "@/lib/onboarding-gate";
import { filterSidebarSearchRoutes, getSidebarSearchRoutes } from "@/components/sidebar-search";
import { LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { onboardingStepFromStorage } from "@/components/onboarding-profile";

test("provides localized onboarding copy in every supported locale", () => {
  const copyFor = (locale: (typeof LOCALES)[number]) =>
    (getDictionary(locale) as ReturnType<typeof getDictionary> & { onboarding?: Record<string, string> }).onboarding;
  expect(copyFor("en")?.profileTitle).toBe("Set up your sharing profile");
  expect(copyFor("tr")?.profileTitle).toBe("Paylaşım profilini ayarla");
  for (const locale of LOCALES) {
    const copy = copyFor(locale);
    expect(copy).toBeDefined();
    expect(Object.values(copy!).every((value) => value.trim().length > 0)).toBe(true);
  }
});

describe("onboarding access and progress", () => {
  test("keeps onboarding revisitable and permits linked setup destinations", () => {
    expect(getOnboardingRedirect(true, "/onboarding", "tr")).toBeNull();
    expect(getOnboardingRedirect(false, "/onboarding", "tr")).toBeNull();
    for (const route of ["/accounts", "/settings/keys", "/settings/appearance"]) {
      expect(getOnboardingRedirect(false, route, "tr")).toBeNull();
    }
  });

  test("sends incomplete profiles away from core workspace routes in their locale", () => {
    expect(getOnboardingRedirect(false, "/dashboard", "tr")).toBe("/onboarding");
    expect(getOnboardingRedirect(false, "/drafts", "en")).toBe("/en/onboarding");
    expect(getOnboardingRedirect(true, "/drafts", "tr")).toBeNull();
  });

  test("restores a valid setup step and rejects invalid local progress", () => {
    expect(onboardingStepFromStorage("ai")).toBe("ai");
    expect(onboardingStepFromStorage("dangerous-route")).toBe("profile");
    expect(onboardingStepFromStorage(null)).toBe("profile");
  });
});

describe("sidebar search routes", () => {
  test("discovers every static sidebar page from the App Router tree", () => {
    const appRoot = resolve(import.meta.dir, "../src/app");
    const discovered: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith("[")) visit(path);
        } else if (/^page\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
          const segments = relative(appRoot, path).split(sep).slice(0, -1).filter((segment) => !segment.startsWith("("));
          if (!segments.some((segment) => segment.startsWith("["))) discovered.push(segments.length ? `/${segments.join("/")}` : "/");
        }
      }
    };
    visit(appRoot);

    const indexed = new Set(getSidebarSearchRoutes("tr").map((route) => route.href));
    expect(discovered.filter((route) => route !== "/settings/profile").sort()).toEqual([...indexed].sort());
    expect(indexed.has("/leaderboard")).toBe(true);
  });

  test("provides searchable localized labels and key routes in every supported locale", () => {
    for (const locale of LOCALES) {
      const routes = getSidebarSearchRoutes(locale);
      expect(routes.length).toBeGreaterThan(8);
      expect(routes.some((route) => route.href === "/onboarding")).toBe(true);
      expect(routes.some((route) => route.href === "/settings/keys")).toBe(true);
      expect(routes.every((route) => route.label.length > 0 && route.group.length > 0)).toBe(true);
    }
  });

  test("matches route keywords and hides unrelated results", () => {
    const routes = getSidebarSearchRoutes("tr");
    expect(filterSidebarSearchRoutes(routes, "chatgpt").map((route) => route.href)).toContain("/settings/keys");
    expect(filterSidebarSearchRoutes(routes, "sources").map((route) => route.href)).toContain("/sources");
    expect(filterSidebarSearchRoutes(routes, "otomasyon").map((route) => route.href)).toContain("/settings/automation");
    expect(filterSidebarSearchRoutes(routes, "no-such-page")).toEqual([]);
  });

  test("includes every settings screen and finds it by common Turkish terms", () => {
    const routes = getSidebarSearchRoutes("tr");
    const settings = routes.filter((route) => route.href.startsWith("/settings"));
    expect(routes.find((route) => route.href === "/profile")?.group).toBe(getDictionary("tr").nav.profile);
    expect(settings.map((route) => route.href).sort()).toEqual([
      "/settings",
      "/settings/appearance",
      "/settings/automation",
      "/settings/keys",
      "/settings/security",
      "/settings/style",
    ]);
    for (const [query, href] of [
      ["tema", "/settings/appearance"],
      ["yazı stili", "/settings/style"],
      ["profil", "/profile"],
      ["şifre", "/settings/security"],
      ["hesap sil", "/settings"],
      ["claude", "/settings/keys"],
    ]) {
      expect(filterSidebarSearchRoutes(routes, query).map((route) => route.href)).toContain(href);
    }
  });
});
