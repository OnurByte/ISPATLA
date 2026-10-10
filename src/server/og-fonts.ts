import { readFile } from "node:fs/promises";
import { join } from "node:path";

type ScriptFont = "latin" | "math" | "arabic" | "bengali" | "cjk" | "devanagari" | "tamil" | "telugu";
const scripts: ReadonlyArray<readonly [ScriptFont, RegExp]> = [
  ["arabic", /[\u0600-\u08FF]/u],
  ["bengali", /[\u0980-\u09FF]/u],
  ["cjk", /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u],
  ["devanagari", /[\u0900-\u097F]/u],
  ["tamil", /[\u0B80-\u0BFF]/u],
  ["telugu", /[\u0C00-\u0C7F]/u],
];

export function ogFontNames(text: string): ScriptFont[] {
  return ["latin", "math", ...scripts.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)];
}

const loaded = new Map<ScriptFont, Promise<Buffer>>();
function load(name: ScriptFont): Promise<Buffer> {
  let pending = loaded.get(name);
  if (!pending) {
    pending = readFile(join(process.cwd(), "public", "fonts", "og-" + name + (name === "cjk" ? ".otf" : ".ttf")));
    loaded.set(name, pending);
  }
  return pending;
}

export async function ogFontsForText(text: string) {
  return Promise.all(ogFontNames(text).map(async name => ({
    name: "ISPATLA " + name,
    data: await load(name),
    weight: 400 as const,
    style: "normal" as const,
  })));
}
