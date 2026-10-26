import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetUrl = process.env.LIGHTHOUSE_URL || "http://localhost:3000/";
const reportDirectory = resolve(process.env.LIGHTHOUSE_REPORT_DIR || join(root, "lighthouse-reports"));
const thresholds = JSON.parse(readFileSync(join(root, "quality/lighthouse-thresholds.json"), "utf8"));
const lighthouseCli = join(root, "node_modules/lighthouse/cli/index.js");
const categories = ["performance", "accessibility", "best-practices", "seo"];

function browserPath() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }

  const systemCandidates = [
    "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const playwrightCache = join(homedir(), ".cache/ms-playwright");
  const playwrightCandidates = existsSync(playwrightCache)
    ? readdirSync(playwrightCache)
        .filter((name) => /^chromium-\d+$/u.test(name))
        .sort((a, b) => Number(b.slice("chromium-".length)) - Number(a.slice("chromium-".length)))
        .flatMap((name) => [
          join(playwrightCache, name, "chrome-linux64/chrome"),
          join(playwrightCache, name, "chrome-linux/chrome"),
        ])
    : [];
  const candidate = [...systemCandidates, ...playwrightCandidates].find(existsSync);
  if (candidate) return candidate;
  return undefined;
}

const chrome = browserPath();
const env = { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) };
const commandBase = [
  lighthouseCli,
  targetUrl,
  `--only-categories=${categories.join(",")}`,
  "--output=html",
  "--output=json",
  "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
  "--quiet",
];

mkdirSync(reportDirectory, { recursive: true });
if (!existsSync(lighthouseCli)) throw new Error("Lighthouse is not installed. Run `bun install` first.");

let failed = false;
for (const profile of ["mobile", "desktop"]) {
  const reportBase = join(reportDirectory, `ispatla-${profile}`);
  const profileFlags = profile === "desktop" ? ["--preset=desktop"] : ["--form-factor=mobile"];
  console.log(`Running ${profile} Lighthouse audit for ${targetUrl}`);
  const result = spawnSync(process.execPath, [...commandBase, ...profileFlags, `--output-path=${reportBase}`], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Lighthouse ${profile} run exited with status ${result.status}`);

  const reportPath = `${reportBase}.report.json`;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const lighthouseResult = report.lighthouseResult || report;
  const requestedUrl = new URL(targetUrl);
  const finalUrl = new URL(lighthouseResult.finalDisplayedUrl);
  if (finalUrl.origin !== requestedUrl.origin || finalUrl.pathname !== requestedUrl.pathname || finalUrl.search !== requestedUrl.search) {
    throw new Error(`Lighthouse navigated away from the requested URL: ${finalUrl.href}`);
  }
  const scores = lighthouseResult.categories;
  for (const category of categories) {
    const score = scores?.[category]?.score;
    const minimum = thresholds[profile][category];
    if (typeof score !== "number") {
      failed = true;
      console.error(`FAIL ${profile} ${category}: score is unavailable`);
      continue;
    }
    const percentage = Math.round(score * 100);
    const minimumPercentage = Math.round(minimum * 100);
    const passes = score >= minimum;
    console.log(`${passes ? "PASS" : "FAIL"} ${profile} ${category}: ${percentage} (minimum ${minimumPercentage})`);
    if (!passes) failed = true;
  }
  console.log(`Reports: ${reportBase}.report.html and ${reportPath}`);
}

if (failed) process.exitCode = 1;
