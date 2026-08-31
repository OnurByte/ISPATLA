import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createIspatlaMcpServer } from "../src/server/mcp";

serveStdio(createIspatlaMcpServer, { onerror: (error) => process.stderr.write(`ispatla-mcp: ${error.message}\n`) });
