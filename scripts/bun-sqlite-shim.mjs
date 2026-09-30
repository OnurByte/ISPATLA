// Preload for the standalone automation worker.
//
// `src/server/db.ts` picks its SQLite driver through
// `process.getBuiltinModule("bun:sqlite")` and then calls it SYNCHRONOUSLY
// (`new DatabaseSync(path)` at module scope). This box's Bun (1.2.3) does not
// implement `process.getBuiltinModule`, so the worker died with
// "builtin is not a function" before it ever opened the database. The web app
// never hit it because it runs on Node, where the same shim resolves
// `node:sqlite`.
//
// Two constraints the shim has to respect:
//   * it must return SYNCHRONOUSLY — an `async` resolver compiles, then blows up
//     with "undefined is not a constructor" at the first query;
//   * it must not touch `node:sqlite`, which under Bun returns a
//     DatabaseSync without the `.prepare()` shape db.ts expects.
//
// `createRequire` gives a synchronous `require("bun:sqlite")` and is a no-op on
// any runtime that already provides getBuiltinModule.
import { createRequire } from "node:module";

const requireBun = createRequire(import.meta.url);

if (typeof globalThis.process?.getBuiltinModule !== "function") {
  globalThis.process.getBuiltinModule = (id) => {
    if (id === "bun:sqlite") return requireBun("bun:sqlite");
    return null;
  };
}
