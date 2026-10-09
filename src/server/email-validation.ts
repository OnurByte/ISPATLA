import { readFileSync } from "node:fs";
import { resolveMx as nodeResolveMx } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { resolve } from "node:path";

const disposableDomainFile = resolve(process.cwd(), "data/disposable-email-domains.txt");
const defaultDisposableDomains = new Set(
  readFileSync(disposableDomainFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#")),
);

const disposableMxProviders = [
  "10minutemail.com",
  "10minutemail.net",
  "dropmail.me",
  "guerrillamail.com",
  "mail.tm",
  "mailinator.com",
  "temp-mail.org",
  "yopmail.com",
];

type MxRecord = { exchange: string; priority: number };
type MxStatus = "valid" | "missing" | "null" | "invalid" | "unknown";
type EmailQualityReason = "invalid_syntax" | "invalid_domain" | "mx_missing" | "null_mx" | "disposable_domain" | "disposable_mx";

export type EmailQualityResult = {
  accepted: boolean;
  normalizedEmail?: string;
  mxStatus: MxStatus;
  reason?: EmailQualityReason;
};

export type EmailQualityOptions = {
  resolveMx?: (domain: string) => Promise<MxRecord[]>;
  dnsTimeoutMs?: number;
  disposableDomains?: ReadonlySet<string>;
};

function normalizeDomain(input: string): string | null {
  const domain = domainToASCII(input.replace(/\.$/, "").toLowerCase());
  if (!domain || domain.length > 253 || !domain.includes(".") || isIP(domain)) return null;
  const labels = domain.split(".");
  if (labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  return domain;
}

function normalizeAddress(local: string, domain: string): string {
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const consumerLocal = local.split("+", 1)[0].replace(/\./g, "").toLowerCase();
    return `${consumerLocal}@gmail.com`;
  }
  return `${local}@${domain}`;
}

export function normalizeEmailAddress(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@") || email.length > 254) return null;
  const local = email.slice(0, at);
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local)) return null;
  const domain = normalizeDomain(email.slice(at + 1));
  return domain ? normalizeAddress(local, domain) : null;
}

function isListedDisposable(domain: string, domains: ReadonlySet<string>): boolean {
  let candidate = domain;
  while (candidate.includes(".")) {
    if (domains.has(candidate)) return true;
    candidate = candidate.slice(candidate.indexOf(".") + 1);
  }
  return false;
}

function isDisposableMx(exchange: string): boolean {
  const host = exchange.toLowerCase().replace(/\.$/, "");
  return disposableMxProviders.some((provider) => host === provider || host.endsWith(`.${provider}`));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export async function validateEmailQuality(email: string, options: EmailQualityOptions = {}): Promise<EmailQualityResult> {
  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedEmail) return { accepted: false, mxStatus: "invalid", reason: email.includes("@") ? "invalid_domain" : "invalid_syntax" };
  const domain = normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
  const disposableDomains = options.disposableDomains ?? defaultDisposableDomains;
  if (isListedDisposable(domain, disposableDomains)) {
    return { accepted: false, mxStatus: "unknown", reason: "disposable_domain" };
  }

  const resolveMx = options.resolveMx ?? ((hostname: string) => nodeResolveMx(hostname));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let records: MxRecord[];
  try {
    records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), options.dnsTimeoutMs ?? 1500);
      }),
    ]);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOTFOUND") return { accepted: false, mxStatus: "invalid", reason: "invalid_domain" };
    if (code === "ENODATA") return { accepted: false, mxStatus: "missing", reason: "mx_missing" };
    return { accepted: true, normalizedEmail, mxStatus: "unknown" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (records.length === 0) return { accepted: false, mxStatus: "missing", reason: "mx_missing" };
  if (records.some((record) => record.exchange === ".")) return { accepted: false, mxStatus: "null", reason: "null_mx" };
  if (records.some((record) => isDisposableMx(record.exchange))) {
    return { accepted: false, mxStatus: "valid", reason: "disposable_mx" };
  }
  return { accepted: true, normalizedEmail, mxStatus: "valid" };
}
