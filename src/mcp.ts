import { fileURLToPath } from "url";
import path from "path";
import { createLogger } from "./server/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerScanServer } from "./server/register.js";
import { installShutdown } from "./server/shutdown.js";
import { selectBackend } from "./services/backends/index.js";
import type { AppContext } from "./context.js";
import pkg from "../package.json" with { type: "json" };

export const version = pkg.version as string;

const config = loadConfig();
// Send logs to stderr to keep stdout clean for MCP protocol
const logger = createLogger("stdio", config.LOG_LEVEL);
const ctx: AppContext = { config, logger, backend: selectBackend(config) };

export async function main() {
  const server = new McpServer(
    { name: "scan-mcp", version },
    {
      capabilities: {
        resources: { listChanged: true },
        prompts: { listChanged: true },
        tools: { listChanged: true },
      },
      instructions:
        "On first use, read resource uri 'mcp://scan-mcp/orientation' for capabilities and defaults.",
    }
  );
  registerScanServer(server, ctx);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stop scanners when the server goes away. The SDK's stdio transport does not notice stdin
  // ending (the client exited or closed the pipe), so watch it here.
  const shutdown = installShutdown(() => server.close(), logger);
  process.stdin.once("end", () => void shutdown("stdin closed"));
  server.server.onclose = () => void shutdown("transport closed");

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
