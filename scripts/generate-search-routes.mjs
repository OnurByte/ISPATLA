import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "../src/app");
const output = resolve(scriptDir, "../src/generated/search-routes.ts");
const routes = [];
const redirectOnlyRoutes = new Set(["/settings/profile"]);

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith("[") && !entry.name.startsWith("_")) visit(path);
      continue;
    }
    if (!/^page\.(?:js|jsx|ts|tsx)$/.test(entry.name)) continue;
    const segments = relative(appRoot, path).split(sep).slice(0, -1).filter((segment) => !segment.startsWith("("));
    const route = segments.length ? `/${segments.join("/")}` : "/";
    if (!segments.some((segment) => segment.startsWith("[")) && !redirectOnlyRoutes.has(route)) routes.push(route);
  }
}

visit(appRoot);
routes.sort();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `// Generated from static Next.js App Router page files.\nexport const SEARCH_PAGE_PATHS = ${JSON.stringify(routes, null, 2)} as const;\n`);
