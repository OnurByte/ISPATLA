import { describe, expect, test } from "bun:test";
import { normalizeEmailAddress, validateEmailQuality } from "../src/server/email-validation";

const gmailMx = [{ exchange: "aspmx.l.google.com", priority: 10 }];

describe("validateEmailQuality", () => {
  test("normalizes domain case and IDN before DNS lookup", async () => {
    let lookedUp = "";
    const result = await validateEmailQuality("Person@BÜCHER.de", {
      resolveMx: async (domain) => { lookedUp = domain; return gmailMx; },
    });
    expect(lookedUp).toBe("xn--bcher-kva.de");
    expect(result).toMatchObject({ accepted: true, normalizedEmail: "Person@xn--bcher-kva.de", mxStatus: "valid" });
  });

  test("rejects malformed syntax and invalid domains without DNS", async () => {
    let lookups = 0;
    const options = { resolveMx: async () => { lookups++; return gmailMx; } };
    for (const email of ["a..b@example.com", ".a@example.com", "a@localhost", "a@-bad.example", "a@@example.com"]) {
      expect((await validateEmailQuality(email, options)).accepted).toBe(false);
    }
    expect(lookups).toBe(0);
  });

  test("rejects domains without MX and explicit Null MX", async () => {
    expect(await validateEmailQuality("a@example.com", { resolveMx: async () => [] }))
      .toMatchObject({ accepted: false, mxStatus: "missing" });
    expect(await validateEmailQuality("a@example.com", { resolveMx: async () => [{ exchange: ".", priority: 0 }] }))
      .toMatchObject({ accepted: false, mxStatus: "null" });
  });

  test("rejects permanent DNS domain errors but fails open on temporary DNS errors", async () => {
    const permanent = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    const temporary = Object.assign(new Error("resolver timeout"), { code: "ETIMEOUT" });
    expect(await validateEmailQuality("a@example.com", { resolveMx: async () => { throw permanent; } }))
      .toMatchObject({ accepted: false, mxStatus: "invalid" });
    expect(await validateEmailQuality("a@example.com", { resolveMx: async () => { throw temporary; } }))
      .toMatchObject({ accepted: true, mxStatus: "unknown" });
  });

  test("times out DNS without blocking signup", async () => {
    const result = await validateEmailQuality("a@example.com", {
      dnsTimeoutMs: 5,
      resolveMx: () => new Promise(() => {}),
    });
    expect(result).toMatchObject({ accepted: true, mxStatus: "unknown" });
  });

  test("rejects listed disposable domains and recognized disposable MX providers", async () => {
    expect(await validateEmailQuality("a@mailinator.com", { resolveMx: async () => gmailMx }))
      .toMatchObject({ accepted: false, reason: "disposable_domain" });
    expect(await validateEmailQuality("a@unlisted.example", {
      resolveMx: async () => [{ exchange: "mx.yopmail.com", priority: 10 }],
      disposableDomains: new Set(),
    })).toMatchObject({ accepted: false, reason: "disposable_mx" });
  });

  test("normalizes only safe Gmail aliases, preserving other local parts", async () => {
    const options = { resolveMx: async () => gmailMx };
    expect((await validateEmailQuality("First.Last+signup@googlemail.com", options)).normalizedEmail)
      .toBe("firstlast@gmail.com");
    expect((await validateEmailQuality("first.last+signup@outlook.com", options)).normalizedEmail)
      .toBe("first.last+signup@outlook.com");
    expect(normalizeEmailAddress("First.Last+signup@googlemail.com")).toBe("firstlast@gmail.com");
    expect(normalizeEmailAddress("bad..local@example.com")).toBeNull();
  });

  test("does not return or log the submitted address on invalid input", async () => {
    const secretAddress = "private-user@invalid-domain";
    const result = await validateEmailQuality(secretAddress);
    expect(JSON.stringify(result)).not.toContain(secretAddress);
  });
});
