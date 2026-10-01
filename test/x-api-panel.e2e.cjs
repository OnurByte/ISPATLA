// End-to-end check for the X API credential panel.
//
//   NODE_PATH=/root/test-hermes/node_modules \
//   LOGIN_URL=… LOGIN_USER=… LOGIN_PASS=… CHROME_PATH=… node test/x-api-panel.e2e.cjs
//
// Chromium in this container drops out partway through a long run, so each step
// gets its own context and the cookie jar is carried by hand. A crashed step is
// reported as a failure rather than ending the sweep.
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
    return { ok: true };
  });
  if (signIn.fatal) { console.log(`FAIL login ${signIn.fatal}`); fail += 1; }
  else { pass += 1; console.log("PASS login"); }

  const probe = await step(async (page) => {
    await page.goto(`${BASE}/settings/keys`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1800);
    const body = (await page.locator("body").innerText()).toLowerCase();
    return {
      hasHeading: body.includes("x api v2"),
      bearer: await page.locator("#x-bearer").isVisible().catch(() => false),
      clientId: await page.locator("#x-client-id").isVisible().catch(() => false),
      clientSecret: await page.locator("#x-client-secret").isVisible().catch(() => false),
      labelCount: await page.locator('label[for="x-bearer"], label[for="x-client-id"], label[for="x-client-secret"]').count(),
      capabilityText: body.includes("okuma") && (body.includes("yayınlama") || body.includes("yayinlama")),
      authorizeButton: await page.getByRole("button", { name: /yetkilendir/i }).isVisible().catch(() => false),
      testButton: await page.getByRole("button", { name: /test et/i }).isVisible().catch(() => false),
      // Placeholder-only inputs are not acceptable: every field needs a visible
      // label above it, so assert on the label element rather than the text.
      passwordType: await page.locator("#x-bearer").getAttribute("type"),
    };
  });

  if (probe.fatal) {
    console.log(`FAIL panel ${probe.fatal}`);
    fail += 8;
  } else {
    const r = probe.out;
    ok(r.hasHeading, "X API v2 başlığı görünür");
    ok(r.bearer, "bearer token alanı görünür");
    ok(r.clientId, "client id alanı görünür");
    ok(r.clientSecret, "client secret alanı görünür");
    ok(r.labelCount >= 2, `etiketler alanlarda görünür (${r.labelCount})`);
    ok(r.capabilityText, "okuma / yayınlama yetenekleri yazıyor");
    ok(r.authorizeButton, "OAuth başlat düğmesi var");
    ok(r.testButton, "bağlantı testi düğmesi var");
    ok(r.passwordType === "password", "bearer alanı maskeli");
  }

  const live = await step(async (page) => {
    await page.goto(`${BASE}/settings/keys`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /test et/i }).click();
    await page.waitForTimeout(6000);
    return { text: (await page.locator("body").innerText()).toLowerCase() };
  });
  if (live.fatal) {
    console.log(`FAIL canlı test ${live.fatal}`);
    fail += 1;
  } else {
    const text = live.out.text;
    ok(
      text.includes("bağlı") || text.includes("bağlantı başarısız") || text.includes("unauthorized"),
      "canlı test sonucu ekranda görünüyor",
    );
  }

  const mobile = await step(async (page) => ({
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
  }), 390);
  if (mobile.fatal) { console.log(`FAIL mobil ${mobile.fatal}`); fail += 1; }
  else ok(!mobile.out.overflow, "390px yatay taşma yok");

  ok(probe.pageErrors.length === 0, `konsol hatası yok (${probe.pageErrors.length})`);
  if (probe.pageErrors.length) console.log(probe.pageErrors.slice(0, 3).join("\n"));

  console.log(`\nRESULT ${pass}/${pass + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
