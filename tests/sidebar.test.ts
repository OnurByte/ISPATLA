import { describe, expect, test } from "bun:test";
import { clampSidebarWidth, getStoredSidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "@/lib/sidebar-width";
import { isSidebarItemActive, isSidebarRouteActive } from "@/lib/sidebar-navigation";
import { filterSidebarSearchRoutes, getSidebarSearchKeyboardAction, getSidebarSearchRoutes, isSidebarSearchShortcut } from "@/components/sidebar-search";
import { LOCALES } from "@/i18n/config";
import { getSidebarResizeState } from "@/components/ui/sidebar";

describe("sidebar width", () => {
  test("keeps the saved width within accessible resize bounds", () => {
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(300);
    expect(SIDEBAR_WIDTH_MIN).toBeGreaterThan(256);
    expect(getStoredSidebarWidth(256)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(getStoredSidebarWidth(320)).toBe(320);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 1)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(256)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_DEFAULT)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 1)).toBe(SIDEBAR_WIDTH_MAX);
  });

  test("collapses at the minimum and expands again when dragged right", () => {
    expect(getSidebarResizeState(256, -40)).toEqual({ width: SIDEBAR_WIDTH_MIN, open: false });
    expect(getSidebarResizeState(SIDEBAR_WIDTH_MIN, 24)).toEqual({ width: SIDEBAR_WIDTH_MIN + 24, open: true });
  });
});

describe("sidebar route state", () => {
  test("opens the nested group when its parent or child route is open", () => {
    expect(isSidebarItemActive("/accounts", "/accounts", ["/sources", "/categories"])).toBe(true);
    expect(isSidebarItemActive("/categories", "/accounts", ["/sources", "/categories"])).toBe(true);
    expect(isSidebarRouteActive("/settings/keys", "/settings/keys")).toBe(true);
    expect(isSidebarRouteActive("/opportunities", "/dashboard")).toBe(false);
  });
});

describe("sidebar search presentation", () => {
  test("gives every searchable destination an icon and a localized description", () => {
    for (const locale of LOCALES) {
      const routes = getSidebarSearchRoutes(locale);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.every((route) => Boolean(route.icon) && route.description.trim().length > 0)).toBe(true);
    }
    const turkishRoutes = getSidebarSearchRoutes("tr");
    expect(turkishRoutes.find((route) => route.href === "/settings/automation")?.description).toContain("görev");
    expect(filterSidebarSearchRoutes(turkishRoutes, "otomasyon").some((route) => route.href === "/settings/automation")).toBe(true);
    expect(turkishRoutes.map((route) => route.href)).toEqual(expect.arrayContaining([
      "/dashboard", "/accounts", "/settings/automation", "/profile", "/onboarding",
    ]));
    expect(turkishRoutes.every((route) => !route.href.startsWith("/app"))).toBe(true);
  });

  test("uses arrow keys to move and Enter to open the active search result", () => {
    expect(getSidebarSearchKeyboardAction("ArrowDown", 0, 3)).toEqual({ type: "move", active: 1 });
    expect(getSidebarSearchKeyboardAction("ArrowUp", 0, 3)).toEqual({ type: "move", active: 2 });
    expect(getSidebarSearchKeyboardAction("Enter", 2, 3)).toEqual({ type: "open", index: 2 });
    expect(getSidebarSearchKeyboardAction("ArrowDown", 0, 0)).toBeNull();
  });

  test("opens search for Command+K and Control+K shortcuts", () => {
    expect(isSidebarSearchShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSidebarSearchShortcut({ key: "K", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isSidebarSearchShortcut({ key: "f", metaKey: true, ctrlKey: false })).toBe(false);
  });
});
