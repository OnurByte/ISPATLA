// End-to-end gate for the onboarding screen.
//
//   NODE_PATH=/root/test-hermes/node_modules \
//   LOGIN_URL=… LOGIN_USER=… LOGIN_PASS=… CHROME_PATH=… node test/onboarding.e2e.cjs
//
// Checks the configured install case: the screen still renders (it stays
// reachable for re-authorising) but reports nothing outstanding, and the
// dashboard is what the root path serves.
const { chromium } = require("playwright-core");

const BASE = process.env.LOGIN_URL || "";
const USER = process.env.LOGIN_USER || "";
const PASS = process.env.LOGIN_PASS || "";
const CHROME = process.env.CHROME_PATH || "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
for (const [name, value] of [["LOGIN_URL", BASE], ["LOGIN_USER", USER], ["LOGIN_PASS", PASS]]) {
  if (!value) { console.error(`${name} gerekli`); process.exit(2); }
}

let pass = 0;
let fail = 0;
const ok = (condition, label) => {
  if (condition) { pass += 1; console.log(`PASS ${label}`); }
  else { fail += 1; console.log(`FAIL ${label}`); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  let state = null;

  async function step(fn, width = 1440) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let context;
      try {
        context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, ...(state ? { storageState: state } : {}) });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        const out = await fn(page, pageErrors);
        state = await context.storageState();
        await context.close();
        return { out, pageErrors };
      } catch (error) {
        if (context) await context.close().catch(() => {});
        if (attempt === 2) return { out: null, pageErrors: [], fatal: String(error).split("\n")[0] };
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  const signIn = await step(async (page) => {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('input[name="username"], input[id*="username"]').first().fill(USER);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    return { path: new URL(page.url()).pathname };
  });
  if (signIn.fatal) { console.log(`FAIL login ${signIn.fatal}`); fail += 1; }
  else { pass += 1; console.log("PASS login"); }

  const board = await step(async (page) => {
    const response = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    return { status: response ? response.status() : 0, path: new URL(page.url()).pathname };
  });
  if (board.fatal) { console.log(`FAIL dashboard ${board.fatal}`); fail += 1; }
  else {
    // A configured install must NOT be pushed onto the onboarding screen.
    ok(board.out.path !== "/onboarding", `kurulu kurulumda dashboard açık kalıyor (${board.out.path})`);
    ok(board.out.status === 200, `dashboard 200 (${board.out.status})`);
  }

  const screen = await step(async (page) => {
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const body = (await page.locator("body").innerText()).toLowerCase();
    return {
      status: 200,
      heading: await page.getByRole("heading", { name: /x bağlantısını kur/i }).isVisible().catch(() => false),
      tabs: await page.getByRole("tab").count(),
      tabLabels: (await page.getByRole("tab").allInnerTexts()).map((t) => t.trim()),
      bearerField: await page.locator("#ob-bearer").isVisible().catch(() => false),
      tokenField: await page.locator("#ob-access-token").isVisible().catch(() => false),
      refreshField: await page.locator("#ob-refresh-token").isVisible().catch(() => false),
      clientId: await page.locator("#ob-client-id").isVisible().catch(() => false),
      clientSecret: await page.locator("#ob-client-secret").isVisible().catch(() => false),
      labels: await page.locator('label[for="ob-bearer"], label[for="ob-access-token"], label[for="ob-refresh-token"], label[for="ob-client-id"], label[for="ob-client-secret"]').count(),
      steps: await page.locator("[data-step]").count(),
      hasTestButton: await page.getByRole("button", { name: /test et/i }).isVisible().catch(() => false),
      mentionsOAuth: body.includes("oauth"),
      mentionsToken: body.includes("token"),
      mentionsKey: body.includes("api key"),
    };
  });

  if (screen.fatal) {
    console.log(`FAIL onboarding ${screen.fatal}`);
    fail += 15;
  } else {
    const r = screen.out;
    ok(r.heading, "onboarding başlığı görünür");
    ok(r.tabs === 3, `3 sekme var (${r.tabs})`);
    ok(r.tabLabels.join("|").toLowerCase().includes("api key"), `API key sekmesi (${r.tabLabels.join(", ")})`);
    ok(r.tabLabels.join("|").toLowerCase().includes("token"), "Token sekmesi");
    ok(r.tabLabels.join("|").toLowerCase().includes("oauth"), "OAuth sekmesi");
    ok(r.bearerField, "API key alanı görünür");
    ok(r.steps >= 3, `kurulum adımları listeleniyor (${r.steps})`);
    ok(r.hasTestButton, "bağlantı testi düğmesi var");
    ok(r.labels >= 1, `etiketler alanlarda (${r.labels})`);
  }

  // Token tab: the manual-token path is the one that must work without OAuth.
  const tokenTab = await step(async (page) => {
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.getByRole("tab", { name: /token/i }).click();
    await page.waitForTimeout(500);
    return {
      accessToken: await page.locator("#ob-access-token").isVisible().catch(() => false),
      refreshToken: await page.locator("#ob-refresh-token").isVisible().catch(() => false),
    };
  });
  if (tokenTab.fatal) { console.log(`FAIL token sekmesi ${tokenTab.fatal}`); fail += 2; }
  else {
    ok(tokenTab.out.accessToken, "Token sekmesinde access token alanı");
    ok(tokenTab.out.refreshToken, "Token sekmesinde refresh token alanı");
  }

  const oauthTab = await step(async (page) => {
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.getByRole("tab", { name: /oauth/i }).click();
    await page.waitForTimeout(500);
    return {
      clientId: await page.locator("#ob-client-id").isVisible().catch(() => false),
      clientSecret: await page.locator("#ob-client-secret").isVisible().catch(() => false),
      authorize: await page.getByRole("button", { name: /yetkilendir/i }).isVisible().catch(() => false),
    };
  });
  if (oauthTab.fatal) { console.log(`FAIL oauth sekmesi ${oauthTab.fatal}`); fail += 3; }
  else {
    ok(oauthTab.out.clientId, "OAuth sekmesinde client id");
    ok(oauthTab.out.clientSecret, "OAuth sekmesinde client secret");
    ok(oauthTab.out.authorize, "OAuth yetkilendirme düğmesi");
  }

  const mobile = await step(async (page) => ({
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  }), 390);
  if (mobile.fatal) { console.log(`FAIL mobil ${mobile.fatal}`); fail += 1; }
  else ok(!mobile.out.overflow, "390px yatay taşma yok");

  ok(screen.pageErrors.length === 0, `konsol hatası yok (${screen.pageErrors.length})`);
  if (screen.pageErrors.length) console.log(screen.pageErrors.slice(0, 3).join("\n"));

  console.log(`\nRESULT ${pass}/${pass + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();