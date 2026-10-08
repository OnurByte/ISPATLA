import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const listUrl = "https://disposable.github.io/disposable-email-domains/domains_mx.txt";
const licenseUrl = "https://raw.githubusercontent.com/disposable/disposable/master/LICENSE";
const maximumDomains = 60_000;
const minimumDomains = 1_000;

const [licenseResponse, listResponse] = await Promise.all([fetch(licenseUrl), fetch(listUrl)]);
if (!licenseResponse.ok || !listResponse.ok) throw new Error("Could not fetch the disposable-domain source or license.");
const license = await licenseResponse.text();
if (!license.includes("MIT License") || !license.includes("Copyright (c) 2017 Andrei Simionescu")) {
  throw new Error("Upstream license changed; review it before updating the vendored list.");
}

const domains = [...new Set((await listResponse.text())
  .split(/\r?\n/)
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean))].sort();
const validDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
if (domains.length < minimumDomains || domains.length > maximumDomains || domains.some((domain) => !validDomain.test(domain))) {
  throw new Error(`Upstream list failed bounds or domain validation (${domains.length} entries).`);
}

const attribution = `# Source: ${listUrl}\n# MIT License\n# Copyright (c) 2017 Andrei Simionescu\n# Copyright (c) 2017 Stefan Meinecke, greenSec GmbH\n# Permission is hereby granted, free of charge, to any person obtaining a copy\n# of this software and associated documentation files (the "Software"), to deal\n# in the Software without restriction, including without limitation the rights\n# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n# copies of the Software, and to permit persons to whom the Software is\n# furnished to do so, subject to the following conditions:\n# The above copyright notice and this permission notice shall be included in all\n# copies or substantial portions of the Software.\n# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n# SOFTWARE.\n# Refresh manually at least every 30 days with: bun scripts/update-disposable-email-domains.ts\n# Generated: ${new Date().toISOString().slice(0, 10)}\n`;
await writeFile(fileURLToPath(new URL("../data/disposable-email-domains.txt", import.meta.url)), `${attribution}${domains.join("\n")}\n`);
console.log(`Updated ${domains.length} validated disposable email domains.`);
