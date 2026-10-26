const PRIVATE_PAGES = new Set(["/mcp/authorize", "/accounts", "/analytics", "/categories", "/dashboard", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/profile", "/queue", "/settings", "/settings/appearance", "/settings/automation", "/settings/keys", "/settings/profile", "/settings/security", "/settings/style", "/sources"]);

export function isProtectedWorkspaceRoute(path: string): boolean {
  return PRIVATE_PAGES.has(path) || /^\/post\/[^/]+$/.test(path);
}
