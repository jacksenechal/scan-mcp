import { fileURLToPath } from "url";
import path from "path";
import { createLogger } from "./server/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerScanServer } from "./server/register.js";

const config = loadConfig();
// Send logs to stderr to keep stdout clean for MCP protocol
const logger = createLogger("stdio", config.LOG_LEVEL);

export async function main() {
  const server = new McpServer(
    { name: "scan-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );
  registerScanServer(server, config);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio mode only in this entrypoint; HTTP/SSE served by src/http-server.ts
}

const isMain = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1] || "") === thisFile;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    logger.error({ err }, "scan-mcp MCP server error");
    process.exit(1);
  });
}
