// Live smoke against a deployed panel — every page the nav exposes, signed in
// through the app's own login form. Env-driven: no host or credential lives in
// the repository.
//
// Run:
//   NODE_PATH=/root/test-hermes/node_modules \
//   SMOKE_BASE=… SMOKE_USER=… SMOKE_PASS=… node scripts/qa/smoke-live.cjs
const { chromium } = require("playwright-core");

const BASE = process.env.SMOKE_BASE || "";
if (!BASE) { console.error("SMOKE_BASE gerekli (ornek: https://panel.example.com)"); process.exit(2); }
const CREDS = { username: process.env.SMOKE_USER || "", password: process.env.SMOKE_PASS || "" };
if (!CREDS.username || !CREDS.password) { console.error("SMOKE_USER ve SMOKE_PASS gerekli"); process.exit(2); }
// The system Chrome cannot open a CDP socket inside this LXC container, so the
// Playwright-managed build is the only reliable driver here.
const CHROME = process.env.SMOKE_CHROME || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

// Locale-independent lowercase: a Turkish-locale fold turns "Ispatla" into
// "ıspatla", which silently fails every title assertion.
const fold = (value) => value.toLowerCase();

const ROUTES = [
  "/", "/x", "/opportunities", "/sources", "/queue", "/drafts",
  "/market", "/analytics", "/categories", "/accounts",
  "/settings/style", "/settings/automation", "/settings/keys",
];

const shell = () => ({
  async withPage(fn) {
    // Chromium inside this container dies mid-run on a long route list, and the
    // whole process unwinds with it. One context per page keeps a single crash
    // from taking the rest of the sweep with it; a dead route is reported, not
    // fatal.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let context;
      try {
        context = await this.browser.newContext({
          viewport: { width: 1440, height: 900 },
          ...(this.state ? { storageState: this.state } : {}),
        });
        const page = await context.newPage();
        const errors = [];
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        page.on("pageerror", (e) => errors.push(String(e)));
        const result = await fn(page, errors);
        // Keep the newest cookie jar: the login form sets the session cookie.
        this.state = await context.storageState();
        await context.close();
        return result;
      } catch (error) {
        if (context) await context.close().catch(() => {});
        const message = String(error).split("\n")[0];
        // "Target page, context or browser has been closed" is the container's
        // Chromium dropping out, not a panel defect.
        if (attempt === 1 && /has been closed|Failed to open a new tab|Protocol error/.test(message)) {
          return { fatal: true, message };
        }
      }
    }
    return { fatal: true, message: "retry sonrasi da acilamadi" };
  },
});

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  // Each page runs in a fresh context so a Chromium crash cannot take the sweep
  // with it — which means the session cookie has to be carried across by hand.
  let storageState = null;
  const runner = Object.assign({ browser }, shell(), {
    get state() { return storageState; },
    set state(value) { storageState = value; },
  });
  const consoleErrors = [];
  const headings = [];
  let pass = 0;
  let fail = 0;

  // 1) Sign in through the real form and keep the session cookie.
  const signIn = await runner.withPage(async (page) => {
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('input[name="username"], input[id*="username"]').first().fill(CREDS.username);
    await page.locator('input[type="password"]').first().fill(CREDS.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    return { ok: true };
  });
  if (signIn.fatal || !signIn.ok) {
    console.log(`FAIL login          ${signIn.message || "giris basarisiz"}`);
    fail += 1;
  } else {
    pass += 1;
    console.log("PASS login          form gonderimi oturum acti");
  }

  // 2) The gate itself: anonymous must land on the login screen, not the panel.
  //    Run it before the session is stored so it cannot borrow the cookie.
  const savedState = runner.state;
  runner.state = null;
  const anon = await runner.withPage(async (page) => {
    const res = await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    return { status: res ? res.status() : 0, path: new URL(page.url()).pathname };
  });
  runner.state = savedState;
  if (anon.fatal) {
    console.log(`FAIL auth gate      ${anon.message}`);
    fail += 1;
  } else if (anon.path === "/login" || anon.status === 307) {
    pass += 1;
    console.log(`PASS auth gate      anonymous -> ${anon.status} ${anon.path}`);
  } else {
    fail += 1;
    console.log(`FAIL auth gate      anonymous -> ${anon.status} ${anon.path}`);
  }

  // 3) Every route, signed in.
  for (const route of ROUTES) {
    const outcome = await runner.withPage(async (page, errors) => {
      const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      const status = res ? res.status() : 0;
      const text = fold(await page.locator("body").innerText());
      const title = await page.title();
      const h1 = await page.locator("h1, h2").first().innerText().catch(() => "");
      const heading = `${route.padEnd(22)} h1="${h1.replace(/\s+/g, " ").trim().slice(0, 60)}"`;
      const signedIn = !new URL(page.url()).pathname.startsWith("/login");

      const titleOk = fold(title).includes("ispatla");
      const notGate = !text.includes("admin authorization required");
      const hasShell = text.includes("ispatla") || text.includes("kontrol");
      const notErrorPage =
        !text.startsWith("application error") &&
        !text.includes("this page could not be found") &&
        !text.includes("503 service");
      const ok = status === 200 && signedIn && notGate && hasShell && notErrorPage && titleOk;
      return { ok, status, title, hasShell, notGate, notErrorPage, titleOk, signedIn, heading, errors };
    });

    if (outcome.fatal) {
      fail += 1;
      console.log(`FAIL ${route.padEnd(22)} ${outcome.message}`);
      continue;
    }
    headings.push(outcome.heading);
    if (outcome.errors.length) consoleErrors.push(...outcome.errors.map((e) => `${route}: ${e}`));
    if (outcome.ok) {
      pass += 1;
      console.log(`PASS ${route.padEnd(22)} status=${outcome.status}`);
    } else {
      fail += 1;
      console.log(
        `FAIL ${route.padEnd(22)} status=${outcome.status} title="${outcome.title}" ` +
        `signedIn=${outcome.signedIn} shell=${outcome.hasShell} gate=${outcome.notGate} ` +
        `errPage=${outcome.notErrorPage} titleOk=${outcome.titleOk}`,
      );
    }
  }

  console.log("\nHEADINGS\n" + headings.join("\n"));
  console.log(`\nRESULT ${pass}/${pass + fail}`);
  if (consoleErrors.length) console.log("CONSOLE ERRORS:\n" + consoleErrors.slice(0, 20).join("\n"));
  else console.log("CONSOLE ERRORS: none");
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
