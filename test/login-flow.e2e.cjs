/**
 * End-to-end check for the operator sign-in flow.
 *
 * Run against any deployment:  LOGIN_URL=https://host/ LOGIN_USER=.. LOGIN_PASS=..
 * Credentials come from the environment so nothing host-specific is stored here.
 */
const BASE = process.env.LOGIN_URL || "http://127.0.0.1:3000";
const USER = process.env.LOGIN_USER;
const PASS = process.env.LOGIN_PASS;
if (!USER || !PASS) { console.error("LOGIN_USER ve LOGIN_PASS gerekli"); process.exit(2); }
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); console.log((c?'  PASS':'  FAIL') + ' ' + m); };

  // 1) anonymous visit must land on the login screen, not a 401 body
  const r = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  ok(r.status() === 200, `anon / -> 200 (got ${r.status()})`);
  ok(await page.locator('h1, [data-slot=card-title]').first().isVisible(), 'login card visible');
  ok(await page.locator('#username').isVisible(), 'username field visible');
  ok(await page.locator('#password').getAttribute('type') === 'password', 'password is masked');
  ok(await page.locator('label[for=username]').isVisible(), 'label above field');
  await page.screenshot({ path: '/tmp/isp-login.png' });

  // 2) wrong password shows an error and stays put
  await page.fill('#username', USER);
  await page.fill('#password', 'definitely-not-the-password');
  await page.click('button[type=submit]');
  await page.waitForSelector('p[role=alert]', { timeout: 10000 });
  ok((await page.locator('p[role=alert]').innerText()).includes('hatalı'), 'wrong password -> error message');

  // 3) real login
  await page.fill('#password', PASS);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 });
  ok(!page.url().includes('/login'), `login redirects to panel (${page.url()})`);
  const cookies = await page.context().cookies();
  const sess = cookies.find(c => c.name === 'isp_session');
  ok(!!sess, 'session cookie set');
  ok(sess && sess.httpOnly === true, 'cookie is httpOnly');
  ok(sess && sess.secure === true, 'cookie is secure');
  const body = await page.locator('body').innerText();
  ok(body.length > 200, `panel rendered (${body.length} chars)`);
  ok(/401|admin authorization/i.test(body) === false, 'no 401 body after login');
  await page.screenshot({ path: '/tmp/isp-panel.png', fullPage: false });

  // 4) reload keeps the session
  await page.reload({ waitUntil: 'domcontentloaded' });
  ok(!(await page.locator('#username').count()), 'session survives reload');
  console.log('\n' + (fails.length ? `FAILURES: ${fails.length}\n - ` + fails.join('\n - ') : 'ALL PASS'));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e.message); process.exit(2); });
