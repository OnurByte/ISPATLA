import { describe, expect, test } from "bun:test";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "@/lib/sidebar-width";
import { isSidebarItemActive, isSidebarRouteActive } from "@/lib/sidebar-navigation";
import { filterSidebarSearchRoutes, getSidebarSearchRoutes } from "@/components/sidebar-search";
import { LOCALES } from "@/i18n/config";

describe("sidebar width", () => {
  test("keeps the saved width within accessible resize bounds", () => {
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 1)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_DEFAULT)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 1)).toBe(SIDEBAR_WIDTH_MAX);
  });
});

describe("sidebar route state", () => {
  test("opens the nested group when its parent or child route is open", () => {
    expect(isSidebarItemActive("/app/accounts", "/app/accounts", ["/app/sources", "/app/categories"])).toBe(true);
    expect(isSidebarItemActive("/app/categories", "/app/accounts", ["/app/sources", "/app/categories"])).toBe(true);
    expect(isSidebarRouteActive("/app/settings/keys", "/app/settings/keys")).toBe(true);
    expect(isSidebarRouteActive("/app/opportunities", "/app")).toBe(false);
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
    expect(turkishRoutes.find((route) => route.href === "/app/settings/automation")?.description).toContain("görev");
    expect(filterSidebarSearchRoutes(turkishRoutes, "otomasyon").some((route) => route.href === "/app/settings/automation")).toBe(true);
  });
});
