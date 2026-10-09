export function isSidebarRouteActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function isSidebarItemActive(pathname: string, href: string, childHrefs: string[] = []) {
  return isSidebarRouteActive(pathname, href) || childHrefs.some((childHref) => isSidebarRouteActive(pathname, childHref));
}
