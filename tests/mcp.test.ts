import { expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createIspatlaMcpServer } from "@/server/mcp";

test("exposes the ISPATLA MCP tool surface without a chat transport", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  let sessionChecks = 0;
  const server = createIspatlaMcpServer({ resolveSession: async () => {
    sessionChecks += 1;
    return { user: { id: "mcp-test-owner" } };
  } });
  const client = new Client({ name: "ispatla-test", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "ispatla.accounts.add", "ispatla.accounts.analyze", "ispatla.accounts.list",
      "ispatla.analytics.performance", "ispatla.drafts.generate", "ispatla.drafts.review",
      "ispatla.failures.list", "ispatla.opportunities.list", "ispatla.opportunity.inspect",
      "ispatla.publications.attach_receipt", "ispatla.publications.cancel", "ispatla.publications.prepare", "ispatla.publications.queue", "ispatla.publications.status", "ispatla.publishing.methods", "ispatla.sources.health", "ispatla.sources.list",
    ]);
    const response = await client.callTool({ name: "ispatla.sources.list", arguments: { enabledOnly: true } });
    expect(response.isError).not.toBe(true);
    expect(sessionChecks).toBe(1);
  } finally {
    await client.close();
    await server.close();
  }
});
