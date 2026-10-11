import { expect, test } from "bun:test";
import { authorizeMcpTool, normalizeMcpScopes, validRedirect, pkceChallenge, tokenDigest } from "../src/server/mcp-authorization";
test("MCP redirect registration excludes insecure non-loopback and credential URLs", () => {
  expect(validRedirect("https://client.example/callback")).toBe(true);
  expect(validRedirect("http://127.0.0.1:9000/callback")).toBe(true);
  for (const value of ["http://client.example/callback", "https://user:pass@client.example/cb", "javascript:alert(1)", "https://client.example/cb#fragment"]) expect(validRedirect(value)).toBe(false);
});
test("agent scopes cannot grant publication approval or account ownership", () => {
  expect(normalizeMcpScopes("read read drafts:write")).toBe("read drafts:write");
  expect(() => normalizeMcpScopes("admin")).toThrow();
  expect(() => authorizeMcpTool("read", "ispatla.drafts.generate", false)).toThrow();
  expect(() => authorizeMcpTool("read drafts:write analysis:write publishing:prepare receipts:write", "ispatla.publications.queue", false)).toThrow();
  expect(() => authorizeMcpTool("publishing:prepare", "ispatla.publications.prepare", false)).not.toThrow();
  expect(() => authorizeMcpTool("read", "ispatla.accounts.list", true)).not.toThrow();
});
test("PKCE challenge follows the S256 RFC vector and stored secrets are hashed", () => {
  expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  expect(tokenDigest("secret")).not.toBe("secret");
  expect(tokenDigest("secret")).toHaveLength(64);
});
