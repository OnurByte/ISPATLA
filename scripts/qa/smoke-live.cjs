// Live smoke for PANEL_HOST — every page the nav exposes, via the
// real HTTPS entrypoint with reverse-proxy credentials.
// Run: NODE_PATH=/root/test-hermes/node_modules node scripts/qa/smoke-live.cjs
const { chromium } = require("playwright-core");

const BASE = "https://PANEL_HOST";
const CREDS = { username: "raksix", password: "REDACTED" };
const CHROME =
  process.env.LOKMA_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

// Locale-independent lowercase: a Turkish-locale fold turns "Ispatla" into
// "ıspatla", which silently fails every title assertion.
const fold = (value) => value.toLowerCase();

const ROUTES = [
  "/", "/x", "/opportunities", "/sources", "/queue", "/drafts",
  "/market", "/analytics", "/categories", "/accounts",
  "/settings/style", "/settings/automation", "/settings/keys",
];

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ httpCredentials: CREDS, viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const headings = [];
  let pass = 0;
  let fail = 0;

  for (const route of ROUTES) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      const status = res ? res.status() : 0;
      const text = fold(await page.locator("body").innerText());
      const title = await page.title();
      const h1 = await page.locator("h1, h2").first().innerText().catch(() => "");
      headings.push(`${route.padEnd(22)} h1="${h1.replace(/\s+/g, " ").trim().slice(0, 60)}"`);

      const titleOk = fold(title).includes("ispatla");
      const notGate = !text.includes("admin authorization required");
      const hasShell = text.includes("ispatla") || text.includes("kontrol"); // app shell renders the brand
      const notErrorPage =
        !text.startsWith("application error") &&
        !text.includes("this page could not be found") &&
        !text.includes("503 service");
      const ok = status === 200 && notGate && hasShell && notErrorPage && titleOk;
      if (ok) {
        pass += 1;
        console.log(`PASS ${route.padEnd(22)} status=${status} h1="${h1.replace(/\s+/g, " ").trim().slice(0, 40)}"`);
      } else {
        fail += 1;
        console.log(`FAIL ${route.padEnd(22)} status=${status} title="${title}" shell=${hasShell} gate=${notGate} errPage=${notErrorPage}`);
      }
      if (errors.length) consoleErrors.push(...errors.map((e) => `${route}: ${e}`));
    } catch (e) {
      fail += 1;
      console.log(`FAIL ${route.padEnd(22)} ${String(e).split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }

  console.log("\nHEADINGS\n" + headings.join("\n"));

  // The reverse-proxy credential must hold for an anonymous visitor.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  let anonStatus = 0;
  try {
    const anonRes = await anonPage.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    anonStatus = anonRes ? anonRes.status() : 0;
  } catch (e) {
    // Chromium refuses to render the 401 challenge without credentials; that is
    // the gate working, not a failure.
    if (String(e).includes("ERR_INVALID_AUTH_CREDENTIALS")) anonStatus = 401;
    else console.log("anon error: " + String(e).split("\n")[0]);
  }
  if (anonStatus === 401) { pass += 1; console.log("PASS auth gate      anonymous -> 401"); }
  else { fail += 1; console.log(`FAIL auth gate      anonymous -> ${anonStatus}`); }
  await anon.close();

  console.log(`\nRESULT ${pass}/${pass + fail}`);
  if (consoleErrors.length) console.log("CONSOLE ERRORS:\n" + consoleErrors.slice(0, 20).join("\n"));
  else console.log("CONSOLE ERRORS: none");
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
